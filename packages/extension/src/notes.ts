import { reading, setNote } from '@yxl-vscode/intent';
import { addrAt } from '@yxl-vscode/units';
import type { Noted } from '@yxl-vscode/webview/protocol';
import { applied, type Port, type Spec, sheetNamed } from './write';

/**
 * A cell's note, written or taken off (`docs/spec.md` §10). The note decorates
 * the cell; what the cell holds is left alone either way.
 */
export async function note(spec: Spec, asked: Noted, port: Port): Promise<void> {
  const sheet = sheetNamed(asked.sheet, port);
  if (sheet === null) return;

  const at = addrAt({ col: asked.col, row: asked.row });
  const intent = setNote(spec, { sheet, at, text: asked.text }, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'note', about: null });
  if (done) port.said(asked.text === null ? `${at} has no note now.` : `${at} carries a note.`);
}
