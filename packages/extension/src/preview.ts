import { reaches } from '@yxl-vscode/compile';
import { type Engine, univerEngine } from '@yxl-vscode/evaluate';
import { addrAt, cellOf, filePath } from '@yxl-vscode/units';
import type { FromView, Typed } from '@yxl-vscode/webview/protocol';
import * as vscode from 'vscode';
import { asOpen, put, reveal, textOf } from './documents';
import { inspect, knows, type Nodes, nodeUnder } from './inspect';
import { type Projected, project, redraw, type Window } from './project';
import { type Offer, type Port, resolve, type Spec, write, writeOverride } from './write';

/** Long enough that typing does not redraw on every keystroke, short enough to feel live. */
const SETTLE = 150;

/** The same, for a cursor, which moves more often and costs less to answer. */
const FOLLOW = 80;

/**
 * The preview: one panel per spec, beside the text.
 *
 * The text editor stays what it was — this is a projection of the document, not
 * a second editor for it (ADR-001), and everything it shows is recomputed from
 * the file rather than kept in step with it.
 */
export class Preview {
  private static open = new Map<string, Preview>();

  private readonly panel: vscode.WebviewPanel;
  private readonly problems: vscode.DiagnosticCollection;
  private readonly listeners: vscode.Disposable[] = [];
  private settling: ReturnType<typeof setTimeout> | undefined;
  private following: ReturnType<typeof setTimeout> | undefined;
  private drawn: Projected | undefined;
  private nodes: Nodes = new Map();
  private read = -1;
  private readonly params = new Map<string, string>();
  private readonly windows = new Map<string, Window>();

  /**
   * One engine for the life of the panel: standing one up registers five
   * hundred functions, and a keystroke should not pay for that.
   */
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
      // Any file this spec is *made of*, not only the one that was opened: an
      // edit to a `$include`d sheet or to `defs.yaml` is an edit to this
      // drawing, and it arrives unsaved — a preview that waited for the save
      // would show the reader the spec they no longer have.
      vscode.workspace.onDidChangeTextDocument((change) => {
        if (this.reads(change.document)) this.later();
      }),
      vscode.workspace.onDidSaveTextDocument((saved) => {
        // A `csv:` or a file changed outside this editor, which no change event
        // spoke for.
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

  /**
   * Which cells the node under the cursor reaches — the other half of the jump.
   *
   * A cursor sits inside every span that holds it, so the *innermost* node is
   * the one being pointed at: the cell rather than the sheet, the definition
   * rather than the document.
   */
  private follow(editor: vscode.TextEditor): void {
    if (!this.reads(editor.document)) return;

    clearTimeout(this.following);
    this.following = setTimeout(() => this.reaching(editor), FOLLOW);
  }

  /** Whether a cursor in this document is a cursor in the spec being previewed. */
  private reads(document: vscode.TextDocument): boolean {
    return (
      document.uri.toString() === this.document.uri.toString() ||
      knows(this.nodes, document.uri.fsPath)
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

    // Spans are offsets into the text they were read from. Asking one about a
    // cursor in text that has since been edited names whatever node the shift
    // happens to land in, so nothing is said until the read catches up — which
    // the redraw below does, and then says it. The spec's own file is read from
    // the editor holding it, so its version is the test; an `$include` is read
    // from disk, so what matters there is whether the editor has saved.
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
    const drawn = project(
      this.document.getText(),
      file,
      asOpen,
      this.params,
      this.windows,
      this.engine,
    );
    const { drawing, diagnostics } = drawn;
    this.drawn = drawn;
    this.nodes = drawn.nodes;

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

  /**
   * What the view may ask for: where a cell came from, take me there, and draw
   * it as though a parameter were something else. None of them touches the file
   * (ADR-001) — the last one changes what is *drawn*, which is the point of a
   * preview that stands for several workbooks.
   */
  private answer(asked: FromView): void {
    if (asked.kind === 'reveal') {
      void reveal(asked.file, asked.start, asked.end);
      return;
    }

    if (asked.kind === 'window') {
      // A window that has not moved is a redraw that would change nothing, and
      // answering it is what turns one stray scroll into a loop.
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

    if (asked.kind === 'resolve') {
      this.tried(this.resolveWith(asked));
      return;
    }

    if (asked.kind === 'override') {
      this.tried(this.overrideWith(asked));
      return;
    }

    if (asked.kind === 'setParam') {
      // Emptying the box gives the parameter back to the spec's own default.
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

  /**
   * The same edit, written as an override — after asking what it is for.
   *
   * The reason came with the asking, from a box beside the refusal itself: an
   * override is an exception somebody made on purpose, and that is where they
   * got to say so (`docs/spec.md` §23).
   */
  private async overrideWith(asked: Extract<FromView, { kind: 'override' }>): Promise<void> {
    const spec = this.spec();
    if (spec === null) {
      this.refuse('this spec has not finished loading', null);
      return;
    }

    const { kind, reason, ...typed } = asked;
    await writeOverride(spec, typed, reason === '' ? undefined : reason, this.port());
  }

  /**
   * Work that may fail, with the failure said rather than dropped.
   *
   * A rejected promise from a message handler goes nowhere anyone can see, and
   * an edit that vanishes without a word is the worst thing this editor can do
   * — the reader cannot tell it from one that was never sent.
   */
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
      put: (file, text) => put(file, text),
      refuse: (why, offer) => this.refuse(why, offer),
      said: (what) => {
        void this.panel.webview.postMessage({ kind: 'said', text: what });
      },
    };
  }

  /**
   * Why an edit did not happen, said in the preview rather than in a corner.
   *
   * A notification is where a reader looks when something *finished*; a refused
   * edit is something they are in the middle of, and their eyes are on the cell
   * they typed into.
   */
  private refuse(why: string, offer: Offer | null): void {
    void this.panel.webview.postMessage({
      kind: 'refused',
      why: why.replace(/`/g, ''),
      typed: offer?.typed ?? null,
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
