import { reaches } from '@yxl-vscode/compile';
import { type Engine, univerEngine } from '@yxl-vscode/evaluate';
import { did, type History, nothing } from '@yxl-vscode/patch';
import { addrAt, cellOf, filePath } from '@yxl-vscode/units';
import type { FromView, Typed } from '@yxl-vscode/webview/protocol';
import * as vscode from 'vscode';
import { asOpen, put, reveal, textOf } from './documents';
import { inspect, type Nodes, nodeUnder } from './inspect';
import { type Projected, project, redraw, type Window } from './project';
import {
  emptied,
  empty,
  goBack,
  type Offer,
  type Port,
  paste,
  pastedWith,
  pasteFrom,
  resolve,
  type Spec,
  write,
  writeOverride,
} from './write';

/** Long enough that typing does not redraw on every keystroke, short enough to feel live. */
const SETTLE = 150;

/** The same, for a cursor, which moves more often and costs less to answer. */
const FOLLOW = 80;

/** The preview: one panel per spec, beside the text, recomputed from the file on every change (ADR-001). */
export class Preview {
  private static open = new Map<string, Preview>();

  private readonly panel: vscode.WebviewPanel;
  private readonly problems: vscode.DiagnosticCollection;
  private readonly listeners: vscode.Disposable[] = [];
  private settling: ReturnType<typeof setTimeout> | undefined;
  private following: ReturnType<typeof setTimeout> | undefined;
  private drawn: Projected | undefined;
  private nodes: Nodes = new Map();
  /** Every file the last drawing was read from, which is what a redraw watches. */
  private sources = new Set<string>();
  private read = -1;
  private readonly params = new Map<string, string>();
  private readonly windows = new Map<string, Window>();
  private history: History = nothing;
  /** What this editor left each file at, which is what says whether its own undo is the honest one (ADR-030). */
  private readonly left = new Map<string, string>();

  /** One engine for the life of the panel: standing one up registers five hundred functions. */
  private readonly engine: Engine = univerEngine();

  static show(document: vscode.TextDocument, extension: vscode.Uri): void {
    const already = Preview.open.get(document.uri.toString());
    if (already !== undefined) {
      already.panel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }

    Preview.open.set(document.uri.toString(), new Preview(document, extension));
  }

  private constructor(
    private readonly document: vscode.TextDocument,
    extension: vscode.Uri,
  ) {
    this.panel = vscode.window.createWebviewPanel(
      'yxl.preview',
      `Preview ${document.uri.path.split('/').at(-1) ?? ''}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(extension, 'dist')] },
    );

    this.problems = vscode.languages.createDiagnosticCollection('yxl');
    this.panel.webview.html = this.page(extension);

    this.listeners.push(
      // Any file the spec is made of, unsaved: a `WorkspaceEdit` into an
      // `$include`d file leaves its buffer dirty and no save ever comes.
      vscode.workspace.onDidChangeTextDocument((change) => {
        if (this.reads(change.document)) this.later();
      }),
      vscode.workspace.onDidSaveTextDocument((saved) => {
        // A file changed outside this editor, which no change event spoke for.
        if (!this.reads(saved)) this.later();
      }),
      vscode.window.onDidChangeTextEditorSelection((moved) => this.follow(moved.textEditor)),
    );

    this.listeners.push(this.panel.webview.onDidReceiveMessage((asked) => this.answer(asked)));
    this.panel.onDidDispose(() => this.close());
    this.redraw();
  }

  private later(): void {
    clearTimeout(this.settling);
    this.settling = setTimeout(() => this.redraw(), SETTLE);
  }

  /** Which cells the node under the text cursor reaches. */
  private follow(editor: vscode.TextEditor): void {
    if (!this.reads(editor.document)) return;

    clearTimeout(this.following);
    this.following = setTimeout(() => this.reaching(editor), FOLLOW);
  }

  /** Whether the last drawing was read from this document — the spec, an `$include`, a `data:` file. */
  private reads(document: vscode.TextDocument): boolean {
    return (
      document.uri.toString() === this.document.uri.toString() ||
      this.sources.has(document.uri.fsPath)
    );
  }

  /** The editor whose cursor to answer about, of those a reader can see. */
  private cursor(): vscode.TextEditor | undefined {
    const active = vscode.window.activeTextEditor;
    if (active !== undefined && this.reads(active.document)) return active;

    return vscode.window.visibleTextEditors.find((one) => this.reads(one.document));
  }

  private reaching(editor: vscode.TextEditor | undefined = this.cursor()): void {
    const grid = this.drawn?.grid;
    if (editor === undefined || grid === undefined || grid === null) return;

    // Spans are offsets into the text as it was read; until the redraw catches
    // up, a cursor in edited text names whatever the shift lands on.
    const own = editor.document.uri.toString() === this.document.uri.toString();
    const inStep = own ? this.document.version === this.read : !editor.document.isDirty;
    if (!inStep) {
      void this.panel.webview.postMessage({ kind: 'highlighted', says: '', cells: [] });
      return;
    }

    const at = editor.document.offsetAt(editor.selection.active);
    const node = nodeUnder(this.nodes, editor.document.uri.fsPath, at);
    if (node === null) {
      void this.panel.webview.postMessage({ kind: 'highlighted', says: '', cells: [] });
      return;
    }

    void this.panel.webview.postMessage({
      kind: 'highlighted',
      says: this.nodes.get(node)?.what ?? 'the cursor',
      cells: reaches(grid, node).map((one) => ({ sheet: one.sheet, ...cellOf(one.at) })),
    });
  }

  private redraw(): void {
    const file = this.document.uri.fsPath;
    this.read = this.document.version;

    const sources = new Set<string>();
    const drawn = project(
      this.document.getText(),
      file,
      (from, path) => {
        const found = asOpen(from, path);
        if (found !== null) sources.add(found.file);
        return found;
      },
      this.params,
      this.windows,
      this.engine,
    );
    const { drawing, diagnostics } = drawn;
    this.drawn = drawn;
    this.nodes = drawn.nodes;
    this.sources = sources;

    void this.panel.webview.postMessage(drawing);
    this.problems.set(
      this.document.uri,
      diagnostics
        .filter((one) => one.file === file)
        .map((one) => {
          const at = new vscode.Range(
            this.document.positionAt(one.span.start),
            this.document.positionAt(one.span.end),
          );
          const shown = new vscode.Diagnostic(at, one.message, vscode.DiagnosticSeverity.Error);
          shown.source = 'yxl';
          shown.code = one.code;
          return shown;
        }),
    );

    this.reaching();
  }

  /** What the view asked for. */
  private answer(asked: FromView): void {
    if (asked.kind === 'reveal') {
      void reveal(asked.file, asked.start, asked.end);
      return;
    }

    if (asked.kind === 'window') {
      // Answering a window that has not moved turns one stray scroll into a loop.
      const at = this.windows.get(asked.sheet);
      if (at?.row === asked.row && at.col === asked.col) return;

      this.windows.set(asked.sheet, { row: asked.row, col: asked.col });
      const drawn = this.drawn;
      if (drawn !== undefined) {
        const drawing = redraw(drawn, this.params, this.windows);
        this.drawn = { ...drawn, drawing };
        void this.panel.webview.postMessage(drawing);
      }
      return;
    }

    if (asked.kind === 'edit') {
      const { kind, ...typed } = asked;
      this.tried(this.write(typed));
      return;
    }

    if (asked.kind === 'undo') {
      this.tried(this.takeBack(asked.redo));
      return;
    }

    if (asked.kind === 'empty') {
      this.tried(this.emptyRange(asked));
      return;
    }

    if (asked.kind === 'emptied') {
      this.tried(this.emptiedWith(asked));
      return;
    }

    if (asked.kind === 'paste') {
      this.tried(this.pasteRect(asked));
      return;
    }

    if (asked.kind === 'pasted') {
      this.tried(this.pastedRect(asked));
      return;
    }

    if (asked.kind === 'pasteText' || asked.kind === 'pastedText') {
      this.tried(this.pasteOutside(asked));
      return;
    }

    if (asked.kind === 'resolve') {
      this.tried(this.resolveWith(asked));
      return;
    }

    if (asked.kind === 'override') {
      this.tried(this.overrideWith(asked));
      return;
    }

    if (asked.kind === 'setParam') {
      if (asked.value === '') this.params.delete(asked.name);
      else this.params.set(asked.name, asked.value);

      this.redraw();
      return;
    }

    const sheet = this.drawn?.grid?.sheets.find((one) => one.name === asked.sheet);
    if (sheet === undefined) return;

    void this.panel.webview.postMessage({
      kind: 'inspected',
      sheet: asked.sheet,
      row: asked.row,
      col: asked.col,
      sources: inspect(
        this.nodes,
        sheet,
        addrAt({ col: asked.col, row: asked.row }),
        this.document.uri.fsPath,
      ),
    });
  }

  /** What a reader typed, handed to the write path with the world it needs. */
  private async write(typed: Typed): Promise<void> {
    const spec = this.spec();
    if (spec === null) {
      this.refuse('this spec has not finished loading', null);
      return;
    }

    await write(spec, typed, this.port());
  }

  /** The last edit taken back in place, or the editor's own undo where this one no longer holds the file (ADR-030). */
  private async takeBack(redo: boolean): Promise<void> {
    const spec = this.spec();
    const port = this.port();
    const taken = spec === null ? null : await goBack(spec, this.history, redo, port);
    if (taken !== null) this.history = taken.history;

    if (taken?.at === 'here') return;
    if (taken?.at === 'nowhere') {
      port.said(redo ? 'nothing to put on again.' : 'nothing left to take back.');
      return;
    }

    const beside = this.panel.viewColumn;
    await vscode.window.showTextDocument(this.document, { preview: false });
    await vscode.commands.executeCommand(redo ? 'redo' : 'undo');

    this.panel.reveal(beside, false);
    void this.panel.webview.postMessage({ kind: 'focus' });
  }

  /** Every cell of a rectangle emptied, as one edit. */
  private async emptyRange(asked: Extract<FromView, { kind: 'empty' }>): Promise<void> {
    const spec = this.spec();
    if (spec === null) {
      this.refuse('this spec has not finished loading', null);
      return;
    }

    const { kind, ...ranged } = asked;
    await empty(spec, ranged, this.port());
  }

  /** The rectangle again, emptied of only the cells that can be. */
  private async emptiedWith(asked: Extract<FromView, { kind: 'emptied' }>): Promise<void> {
    const spec = this.spec();
    if (spec === null) {
      this.refuse('this spec has not finished loading', null);
      return;
    }

    const { kind, choice, ...ranged } = asked;
    await emptied(spec, ranged, choice, this.port());
  }

  /** A rectangle put down somewhere else, as one edit. */
  private async pasteRect(asked: Extract<FromView, { kind: 'paste' }>): Promise<void> {
    const spec = this.spec();
    if (spec === null) {
      this.refuse('this spec has not finished loading', null);
      return;
    }

    const { kind, ...pasted } = asked;
    await paste(spec, pasted, this.port());
  }

  /** The same rectangle again, into only the cells that can take it. */
  private async pastedRect(asked: Extract<FromView, { kind: 'pasted' }>): Promise<void> {
    const spec = this.spec();
    if (spec === null) {
      this.refuse('this spec has not finished loading', null);
      return;
    }

    const { kind, choice, ...pasted } = asked;
    await pastedWith(spec, pasted, choice, this.port());
  }

  /** A rectangle from another spreadsheet, in the shape the reader picked for it. */
  private async pasteOutside(
    asked: Extract<FromView, { kind: 'pasteText' | 'pastedText' }>,
  ): Promise<void> {
    const spec = this.spec();
    if (spec === null) {
      this.refuse('this spec has not finished loading', null);
      return;
    }

    const { kind, ...text } = asked;
    const choice = 'choice' in text ? text.choice : undefined;

    await pasteFrom(spec, text, this.port(), choice);
  }

  /** The edit again, made the way the reader chose from the answers it had. */
  private async resolveWith(asked: Extract<FromView, { kind: 'resolve' }>): Promise<void> {
    const spec = this.spec();
    if (spec === null) {
      this.refuse('this spec has not finished loading', null);
      return;
    }

    const { kind, choice, ...typed } = asked;
    await resolve(spec, typed, choice, this.port());
  }

  /** The same edit, written as an override, with the reason the reader gave (`docs/spec.md` §23). */
  private async overrideWith(asked: Extract<FromView, { kind: 'override' }>): Promise<void> {
    const spec = this.spec();
    if (spec === null) {
      this.refuse('this spec has not finished loading', null);
      return;
    }

    const { kind, reason, ...typed } = asked;
    await writeOverride(spec, typed, reason === '' ? undefined : reason, this.port());
  }

  /** Work that may fail, with the failure said: a rejected promise from a message handler goes nowhere. */
  private tried(work: Promise<void>): void {
    void work.catch((failed: unknown) => {
      this.refuse(failed instanceof Error ? failed.message : String(failed), null);
    });
  }

  /** The spec as the write path needs it, or nothing where it is not readable. */
  private spec(): Spec | null {
    const drawn = this.drawn;
    const root = filePath(this.document.uri.fsPath);
    if (drawn?.grid == null || drawn.doc == null || root === null) return null;

    return { root, doc: drawn.doc, grid: drawn.grid, read: asOpen, params: this.params };
  }

  private port(): Port {
    return {
      text: (file) => textOf(this.document, file),
      put: async (file, text) => {
        this.left.set(file, text);
        await put(file, text);
      },
      refuse: (why, offer) => this.refuse(why, offer),
      said: (what) => {
        void this.panel.webview.postMessage({ kind: 'said', text: what });
      },
      kept: (step) => {
        if (step !== null) {
          this.history = did(this.history, step);
          return;
        }

        this.history = nothing;
        this.left.clear();
      },
      left: (file) => this.left.get(file) ?? null,
    };
  }

  /** Why an edit did not happen, said in the preview where the reader is looking. */
  private refuse(why: string, offer: Offer | null): void {
    void this.panel.webview.postMessage({
      kind: 'refused',
      why: why.replace(/`/g, ''),
      typed: offer?.typed ?? null,
      ranged: offer?.ranged ?? null,
      pasted: offer?.pasted ?? null,
      text: offer?.text ?? null,
      canOverride: offer?.canOverride ?? false,
      choices: (offer?.choices ?? []).map((one) => ({
        ...one,
        what: one.what.replace(/`/g, ''),
      })),
    });
  }

  private close(): void {
    Preview.open.delete(this.document.uri.toString());
    clearTimeout(this.settling);
    clearTimeout(this.following);
    for (const listener of this.listeners) listener.dispose();
    this.problems.dispose();
  }

  private page(extension: vscode.Uri): string {
    const { webview } = this.panel;
    const script = webview.asWebviewUri(vscode.Uri.joinPath(extension, 'dist', 'webview.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(extension, 'dist', 'webview.css'));
    const nonce = Math.random().toString(36).slice(2);

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
    <link href="${style}" rel="stylesheet" />
  </head>
  <body>
    <main id="grid"></main>
    <script nonce="${nonce}" src="${script}"></script>
  </body>
</html>`;
  }
}
