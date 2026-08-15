import * as vscode from 'vscode';
import { Preview } from './preview';

/**
 * What VS Code calls, and all it calls.
 *
 * One command, because the preview is a projection beside the text rather than
 * a replacement for it: the file stays a YAML file in a YAML editor, which is
 * the premise this project rests on (§1).
 */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('yxl.showPreview', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor === undefined) {
        void vscode.window.showInformationMessage('Open a `*.yxl.yaml` spec first.');
        return;
      }

      Preview.show(editor.document, context.extensionUri);
    }),
  );
}
