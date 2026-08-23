import { reading, setMerged } from '@yxl-vscode/intent';
import type { Merged } from '@yxl-vscode/webview/protocol';
import { applied, type Port, type Spec, sheetNamed } from './write';

/**
 * A rectangle drawn as one cell, or taken back apart: the sheet's own `merges:`
 * list, which has one place to be written and so is never a question.
 */
export async function merge(spec: Spec, merged: Merged, port: Port): Promise<void> {
  const sheet = sheetNamed(merged.sheet, port);
  if (sheet === null) return;

  const { top, left, bottom, right } = merged;
  const where = { sheet, rect: { top, left, bottom, right }, merged: merged.merged };
  const intent = setMerged(spec, where, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'merge', about: null });
  if (done) port.said(merged.merged ? 'Merged.' : 'Taken apart again.');
}
