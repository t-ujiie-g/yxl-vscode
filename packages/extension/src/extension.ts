import { statSync } from 'node:fs';
import * as vscode from 'vscode';
import { Compiler } from './commands';
import { PANEL, Preview } from './preview';
import { say } from './text';
import { PROPOSED, proposedText, tidy } from './tidy';
import { reader } from './words';

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
    vscode.commands.registerCommand('yxl.newSpec', async (into?: vscode.Uri) => {
      const written = await compiler.init(intoFolder(into));
      if (written === null) return;

      const document = await vscode.workspace.openTextDocument(written);
      await vscode.window.showTextDocument(document, { preview: false });
      Preview.show(document, context.extensionUri);
    }),
    vscode.commands.registerCommand('yxl.tidy', () => {
      const document = specInFocus();
      if (document !== undefined) void tidy(document);
    }),
    vscode.commands.registerCommand('yxl.keepKey', () => {}),
    vscode.workspace.registerTextDocumentContentProvider(PROPOSED, proposedText),
    vscode.window.registerWebviewPanelSerializer(PANEL, {
      deserializeWebviewPanel: (panel, state) => revive(panel, state, context.extensionUri),
    }),
  );
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

/** The spec a command is about: the one being edited, or the one the grid in front of the reader draws. */
function specInFocus(): vscode.TextDocument | undefined {
  // The grid the reader is in decides, where they are in one: `activeTextEditor`
  // holds the last text they touched, which may be another spec entirely.
  const document = Preview.spec() ?? vscode.window.activeTextEditor?.document;
  if (document === undefined) {
    void vscode.window.showInformationMessage(
      reader(vscode.env.language)(say('host.open-a-spec-first')),
    );
  }

  return document;
}

/** The folder a *New Spec* was asked for in: the one right-clicked, or the one holding the file that was. */
function intoFolder(one: vscode.Uri | undefined): vscode.Uri | undefined {
  if (one === undefined) return undefined;

  return statSync(one.fsPath).isDirectory() ? one : vscode.Uri.joinPath(one, '..');
}
