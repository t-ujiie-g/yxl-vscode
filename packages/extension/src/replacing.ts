import { finds } from '@yxl-vscode/compile';
import { reading, replaceIn } from '@yxl-vscode/intent';
import type { A1Addr } from '@yxl-vscode/units';
import type { Replaced } from '@yxl-vscode/webview/protocol';
import { say } from './text';
import { applied, ONLY, type Port, type Spec, sheetNamed, theseOnly } from './write';

/**
 * What a find turned up, written again with the text replaced: every cell of it
 * in one edit, or only the one the reader is on (§8 Q14).
 */
export async function replace(
  spec: Spec,
  asked: Replaced,
  port: Port,
  choice?: string,
): Promise<void> {
  const sheet = sheetNamed(asked.sheet, port);
  if (sheet === null) return;

  const drawn = spec.grid.sheets.find((one) => one.name === sheet);
  if (drawn === undefined) return;

  const at: readonly A1Addr[] =
    asked.at === null ? finds(drawn, asked.looking) : [asked.at as A1Addr];
  const where = { sheet, at, looking: asked.looking, becomes: asked.becomes };

  const read = reading(port.text);
  const only = choice === ONLY;
  const intent = replaceIn(spec, where, read, only ? 'skip' : 'refuse');

  if (intent.kind === 'refused' && !only) {
    const some = replaceIn(spec, where, read, 'skip');
    const cells = some.kind === 'edit' ? some.expects.cells : null;

    port.refuse(intent.why, theseOnly({ ...asked, kind: 'replace' }, REPLACED, cells));
    return;
  }

  const done = await applied(spec, intent, port, { anyway: false, from: null, about: null });
  if (!done) return;

  const many = intent.kind === 'edit' ? intent.expects.cells.size : 0;
  port.said(say('host.cells-replaced', { many }));
}

/** The answer a refused replacement offers: the ones it can write, named as the refusal counted them. */
const REPLACED = say('host.replace-the-ones');
