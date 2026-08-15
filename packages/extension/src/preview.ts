import { reaches } from '@yxl-vscode/compile';
import { type Engine, univerEngine } from '@yxl-vscode/evaluate';
import { setFormula, setValue } from '@yxl-vscode/intent';
import { addrAt, cellOf, type FilePath, filePath, sheetName } from '@yxl-vscode/units';
import { type Change, checked } from '@yxl-vscode/verify';
import type { FromView } from '@yxl-vscode/webview/protocol';
import * as vscode from 'vscode';
import { readBeside } from './files';
import { inspect, knows, type Nodes, nodeAt } from './inspect';
import { type Projected, project, redraw, type Window } from './project';

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
/** What the reader typed, as the value it stands for. */
function read(typed: string): string | number | boolean | null {
  if (typed === '') return null;
  if (typed === 'true' || typed === 'false') return typed === 'true';

  const number = Number(typed);
  return typed.trim() !== '' && Number.isFinite(number) ? number : typed;
}

/** A refusal, said the way a message box says things. */
function said(why: string): string {
  return `yxl: ${why.replace(/`/g, '')}`;
}

function surprising(surprises: readonly Change[]): string {
  const cells = surprises.filter((one) => one.kind === 'cell').length;
  return `this would also change ${cells} cell${cells === 1 ? '' : 's'} it did not name, which needs the resolution dialog`;
}

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
      vscode.workspace.onDidChangeTextDocument((change) => {
        if (change.document.uri.toString() === document.uri.toString()) this.later();
      }),
      vscode.workspace.onDidSaveTextDocument((saved) => {
        // A `$include` or a `csv:` this spec reads may have been what changed.
        if (saved.uri.toString() !== document.uri.toString()) this.later();
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
    const node = nodeAt(this.nodes, editor.document.uri.fsPath, at);
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
      readBeside,
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
      void this.reveal(asked.file, asked.start, asked.end);
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
      void this.write(asked);
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
      sources: inspect(this.nodes, sheet, addrAt({ col: asked.col, row: asked.row })),
    });
  }

  /**
   * What a reader typed into a cell, as an edit to the spec.
   *
   * Three things have to agree before a byte moves: the gesture has to name one
   * node of the spec (ADR-006), the checker has to find that the edit changed
   * what it said it would (ADR-009), and the patch has to be one that can be
   * taken back (ADR-026). Each refusal is a sentence, because an edit that
   * quietly does nothing is worse than one that says why not.
   */
  private async write(asked: Extract<FromView, { kind: 'edit' }>): Promise<void> {
    const grid = this.drawn?.grid;
    const root = filePath(this.document.uri.fsPath);
    if (grid === undefined || grid === null || root === null) return;

    const sheet = sheetName(asked.sheet);
    const at = addrAt({ col: asked.col, row: asked.row });
    if (sheet === null) return;

    const typed = asked.text;
    const intent = typed.startsWith('=')
      ? setFormula(grid, { sheet, at }, typed.slice(1), (file) => this.textOf(file))
      : setValue(grid, { sheet, at }, read(typed), (file) => this.textOf(file));

    if (intent.kind === 'refused') {
      void vscode.window.showWarningMessage(said(intent.why));
      return;
    }

    const source = this.textOf(intent.file);
    if (source === null) return;

    const done = checked(source, intent.patch, intent.expects, {
      root,
      file: intent.file,
      read: readBeside,
      params: this.params,
    });

    if (done.ok === false) {
      const why = done.diagnostics[0]?.message ?? surprising(done.surprises);
      void vscode.window.showWarningMessage(said(why));
      return;
    }
    if (done.ok === 'ask') {
      // The dialog that offers a choice is the next phase's; until it exists,
      // an edit that would move cells it did not name is one this editor
      // declines to make silently.
      void vscode.window.showWarningMessage(said(surprising(done.surprises)));
      return;
    }

    await this.put(intent.file, done.text);
  }

  /** The file as the reader has it: the buffer if it is open, the disk if not. */
  private textOf(file: FilePath): string | null {
    const open = vscode.workspace.textDocuments.find((one) => one.uri.fsPath === file);
    if (open !== undefined) return open.getText();

    const here = filePath(this.document.uri.fsPath);
    return here === null ? null : (readBeside(here, file)?.source ?? null);
  }

  /** The whole file, replaced — the patch already decided what changed in it. */
  private async put(file: FilePath, text: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const whole = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length),
    );

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, whole, text);
    await vscode.workspace.applyEdit(edit);
  }

  /**
   * Take the reader to the node behind a cell — in whichever file it lives,
   * since an `$include` puts a definition somewhere else.
   */
  private async reveal(file: string, start: number, end: number): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const at = new vscode.Range(document.positionAt(start), document.positionAt(end));

    const editor = await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.One,
      preserveFocus: false,
      selection: at,
    });
    editor.revealRange(at, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
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
