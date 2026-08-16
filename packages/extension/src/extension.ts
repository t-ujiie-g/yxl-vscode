import * as vscode from 'vscode';
import { Compiler } from './commands';
import { Preview } from './preview';

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
    vscode.commands.registerCommand('yxl.check', () => {
      const document = specInFocus();
      if (document !== undefined) void compiler.check(document.uri);
    }),
    vscode.commands.registerCommand('yxl.build', () => {
      const document = specInFocus();
      if (document !== undefined) void compiler.build(document.uri);
    }),
  );
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
