import { finds } from '@yxl-vscode/compile';
import { reading, replaceIn } from '@yxl-vscode/intent';
import type { A1Addr } from '@yxl-vscode/units';
import type { Replaced } from '@yxl-vscode/webview/protocol';
import { applied, type Port, type Spec, sheetNamed } from './write';

/**
 * What a find turned up, written again with the text replaced: every cell of it
 * in one edit, or only the one the reader is on (§8 Q14).
 */
export async function replace(spec: Spec, asked: Replaced, port: Port): Promise<void> {
  const sheet = sheetNamed(asked.sheet, port);
  if (sheet === null) return;

  const drawn = spec.grid.sheets.find((one) => one.name === sheet);
  if (drawn === undefined) return;

  const at: readonly A1Addr[] =
    asked.at === null ? finds(drawn, asked.looking) : [asked.at as A1Addr];
  const where = { sheet, at, looking: asked.looking, becomes: asked.becomes };
  const intent = replaceIn(spec, where, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: null, about: null });
  if (!done) return;

  const many = intent.kind === 'edit' ? intent.expects.cells.size : 0;
  port.said(`${many} cell${many === 1 ? '' : 's'} replaced.`);
}
