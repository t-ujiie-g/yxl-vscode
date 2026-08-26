import { reading, setSorted } from '@yxl-vscode/intent';
import type { Sorted } from '@yxl-vscode/webview/protocol';
import { applied, type Port, rectIn, type Spec, sheetNamed } from './write';

/**
 * Rows of a `data:` block put in order, all the way to the file: one place to
 * write, so it is an intent rather than a question, and what it changes is the
 * order of the lines and nothing about any of them.
 */
export async function sort(spec: Spec, sorted: Sorted, port: Port): Promise<void> {
  const sheet = sheetNamed(sorted.sheet, port);
  if (sheet === null) return;

  const rect = rectIn(sorted);
  const where = { sheet, rect, down: sorted.down };
  const intent = setSorted(spec, where, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'sort', about: null });
  if (done) port.said(`${rect.bottom - rect.top + 1} rows in order.`);
}
