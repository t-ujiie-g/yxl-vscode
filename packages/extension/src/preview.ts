import * as vscode from 'vscode';
import { readBeside } from './files';
import { project } from './project';

/** Long enough that typing does not redraw on every keystroke, short enough to feel live. */
const SETTLE = 150;

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
    );

    this.panel.onDidDispose(() => this.close());
    this.redraw();
  }

  private later(): void {
    clearTimeout(this.settling);
    this.settling = setTimeout(() => this.redraw(), SETTLE);
  }

  private redraw(): void {
    const file = this.document.uri.fsPath;
    const { drawing, diagnostics } = project(this.document.getText(), file, readBeside);

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

  private close(): void {
    Preview.open.delete(this.document.uri.toString());
    clearTimeout(this.settling);
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
