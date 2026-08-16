import type { DataReader } from '@yxl-vscode/compile';
import type { IncludeReader } from '@yxl-vscode/loader';
import { type FilePath, filePath } from '@yxl-vscode/units';
import * as vscode from 'vscode';
import { openFirst, readBeside } from './files';

/**
 * Every file a spec is made of, as the reader has it.
 *
 * The one that was opened comes from its own buffer; so must the rest, or a
 * spec assembled from `$include` is drawn half from the editor and half from
 * the disk — and the half that is stale is whichever one was just edited, since
 * an applied `WorkspaceEdit` leaves the buffer dirty.
 */
export const asOpen: IncludeReader & DataReader = openFirst(readBeside, (file) => buffered(file));

/** One file, by the same rule, for a caller that has a path rather than a spec. */
export function textOf(from: vscode.TextDocument, file: FilePath): string | null {
  const here = filePath(from.uri.fsPath);
  return here === null ? null : (asOpen(here, file)?.source ?? null);
}

/** The whole file, replaced — the patch already decided what changed in it. */
export async function put(file: FilePath, text: string): Promise<void> {
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
 * Take the reader to a span — in whichever file it lives, since an `$include`
 * puts a definition somewhere else.
 */
export async function reveal(file: string, start: number, end: number): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
  const at = new vscode.Range(document.positionAt(start), document.positionAt(end));

  const editor = await vscode.window.showTextDocument(document, {
    viewColumn: vscode.ViewColumn.One,
    preserveFocus: false,
    selection: at,
  });
  editor.revealRange(at, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

/** What the editor holds for a file, where it holds anything for it. */
function buffered(file: FilePath): string | null {
  const open = vscode.workspace.textDocuments.find((one) => one.uri.fsPath === file);
  return open === undefined ? null : open.getText();
}
