import { reading, tableOver } from '@yxl-vscode/intent';
import { rangeOf } from '@yxl-vscode/units';
import type { Tabled } from '@yxl-vscode/webview/protocol';
import { applied, type Port, type Spec, sheetNamed } from './write';

/**
 * A region made an Excel table, or the tables it touches taken off
 * (`docs/spec.md` §11). The cells stay ordinary cells; the entry says only what
 * the region is.
 */
export async function formatTable(spec: Spec, asked: Tabled, port: Port): Promise<void> {
  const sheet = sheetNamed(asked.sheet, port);
  if (sheet === null) return;

  const rect = { top: asked.top, left: asked.left, bottom: asked.bottom, right: asked.right };
  const intent = tableOver(spec, { sheet, rect, on: asked.on }, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'tabled', about: null });
  if (!done) return;

  const over = rangeOf(rect);
  port.said(asked.on ? `${over} is a table now.` : `${over} is no longer a table.`);
}
