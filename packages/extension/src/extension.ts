import * as vscode from 'vscode';
import { Compiler } from './commands';
import { Preview } from './preview';
import { STARTER, specPath } from './starter';

/** The yxl this preview targets, compiled in from the one place it is pinned. */
declare const YXL_TARGET: string;

/** What VS Code calls: a preview beside the text, not a replacement for it (ADR-020). */
export function activate(context: vscode.ExtensionContext): void {
  const compiler = new Compiler(YXL_TARGET);

  context.subscriptions.push(
    compiler,
    vscode.commands.registerCommand('yxl.showPreview', () => {
      const document = specInFocus();
      if (document !== undefined) Preview.show(document, context.extensionUri);
    }),
    vscode.commands.registerCommand('yxl.newSpec', () => void newSpec(context.extensionUri)),
    vscode.commands.registerCommand('yxl.showSource', () => Preview.showSource()),
    vscode.commands.registerCommand('yxl.check', () => {
      const document = specInFocus();
      if (document !== undefined) void compiler.check(document.uri);
    }),
    vscode.commands.registerCommand('yxl.build', () => {
      const document = specInFocus();
      if (document !== undefined) void compiler.build(document.uri);
    }),
    // Bound to the look shortcuts while the preview is active, so that VS Code
    // does not answer the keys the view has already taken (ADR-046).
    vscode.commands.registerCommand('yxl.keepKey', () => {}),
    vscode.window.registerWebviewPanelSerializer('yxl.preview', {
      deserializeWebviewPanel: (panel, state) => revive(panel, state, context.extensionUri),
    }),
  );
}

/** A spec to start from, written where the reader says and opened beside its grid. */
async function newSpec(extension: vscode.Uri): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
  const asking = {
    title: 'A new yxl spec',
    saveLabel: 'Create',
    filters: { 'yxl spec': ['yaml'] },
  };
  const chosen = await vscode.window.showSaveDialog(
    folder === undefined
      ? asking
      : { ...asking, defaultUri: vscode.Uri.joinPath(folder, 'sheet.yxl.yaml') },
  );
  if (chosen === undefined) return;

  const where = chosen.with({ path: specPath(chosen.path) });
  await vscode.workspace.fs.writeFile(where, new TextEncoder().encode(STARTER));

  const document = await vscode.workspace.openTextDocument(where);
  await vscode.window.showTextDocument(document, { preview: false });
  Preview.show(document, extension);
}

/** A preview VS Code kept across a window reload, back on the spec the view saved. */
async function revive(
  panel: vscode.WebviewPanel,
  state: unknown,
  extension: vscode.Uri,
): Promise<void> {
  const file = (state as { file?: unknown } | null)?.file;
  if (typeof file !== 'string') {
    panel.dispose();
    return;
  }

  try {
    Preview.revive(
      await vscode.workspace.openTextDocument(vscode.Uri.file(file)),
      extension,
      panel,
    );
  } catch {
    // The spec has been moved or deleted since the window was last open.
    panel.dispose();
  }
}

/** The spec a command is about: the one being edited. */
function specInFocus(): vscode.TextDocument | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    void vscode.window.showInformationMessage('Open a `*.yxl.yaml` spec first.');
    return undefined;
  }
  return editor.document;
}
