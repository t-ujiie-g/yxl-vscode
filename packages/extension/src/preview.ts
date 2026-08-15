import { reaches } from '@yxl-vscode/compile';
import { addrAt, cellOf } from '@yxl-vscode/units';
import type { FromView } from '@yxl-vscode/webview/protocol';
import * as vscode from 'vscode';
import { readBeside } from './files';
import { inspect, type Nodes, nodeAt } from './inspect';
import { type Projected, project } from './project';

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
      vscode.window.onDidChangeTextEditorSelection((moved) => {
        if (moved.textEditor.document.uri.toString() === document.uri.toString()) this.follow();
      }),
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
  private follow(): void {
    clearTimeout(this.following);
    this.following = setTimeout(() => this.reaching(), FOLLOW);
  }

  private reaching(): void {
    const editor = vscode.window.visibleTextEditors.find(
      (one) => one.document.uri.toString() === this.document.uri.toString(),
    );
    const grid = this.drawn?.grid;
    if (editor === undefined || grid === undefined || grid === null) return;

    const at = this.document.offsetAt(editor.selection.active);
    const node = nodeAt(this.nodes, this.document.uri.fsPath, at);
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
    const drawn = project(this.document.getText(), file, readBeside);
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
  }

  /**
   * The two questions the view may ask, neither of which changes anything: where
   * a cell came from, and take me there.
   */
  private answer(asked: FromView): void {
    if (asked.kind === 'reveal') {
      void this.reveal(asked.file, asked.start, asked.end);
      return;
    }

    const sheet = this.drawn?.grid?.sheets[asked.sheet];
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
