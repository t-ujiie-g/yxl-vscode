import { reading, setRun } from '@yxl-vscode/intent';
import { addrAt } from '@yxl-vscode/units';
import type { EditedRun } from '@yxl-vscode/webview/protocol';
import { applied, type Port, type Spec, sheetNamed } from './write';

/**
 * One run of a rich cell, retyped in the bar over the grid (`docs/spec.md` §3).
 * The run keeps the font it wears; a cell holding runs is never written as a
 * value, so a run at a time is the whole of what this changes.
 */
export async function editRun(spec: Spec, asked: EditedRun, port: Port): Promise<void> {
  const sheet = sheetNamed(asked.sheet, port);
  if (sheet === null) return;

  const at = addrAt({ col: asked.col, row: asked.row });
  const where = { sheet, at, index: asked.index, text: asked.text };
  const intent = setRun(spec, where, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: null, about: null });
  if (done) port.said(`Run ${asked.index + 1} of ${at} now reads ${asked.text}.`);
}
