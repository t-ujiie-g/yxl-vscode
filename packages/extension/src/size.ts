import { reading, setSize } from '@yxl-vscode/intent';
import { sheetName } from '@yxl-vscode/units';
import type { Resized } from '@yxl-vscode/webview/protocol';
import { applied, type Port, type Spec, shown } from './write';

/**
 * A column or a row dragged to a size, all the way to the file: the answers are
 * §4.4's `setSize` table, and a band that reaches past the one dragged is asked
 * about rather than taken.
 */
export async function resize(
  spec: Spec,
  resized: Resized,
  port: Port,
  choice?: string,
): Promise<void> {
  const sheet = sheetName(resized.sheet);
  if (sheet === null) {
    port.refuse(`\`${resized.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const read = reading(port.text);
  const answers = setSize({ grid: spec.grid }, { ...resized, sheet }, read);

  if (answers.length === 0) {
    port.refuse(`nothing here can say how wide that ${resized.axis} is`, null);
    return;
  }

  const sole = answers.length === 1 ? answers[0] : undefined;
  const taken = choice === undefined ? sole : answers.find((one) => one.id === choice);

  if (taken === undefined || (choice === undefined && taken.alone !== true)) {
    if (choice !== undefined) {
      port.refuse('that answer is no longer one of the ways this edit could be made', null);
      return;
    }

    port.refuse(comes(resized), {
      about: { is: 'resized', resized },
      canOverride: false,
      choices: answers.map(shown),
    });
    return;
  }

  const done = await applied(spec, taken.intent, port, {
    anyway: false,
    from: taken.id,
    typed: null,
  });
  if (done) port.said(`${resized.axis === 'column' ? 'Column' : 'Row'} ${resized.at} resized.`);
}

/** Why a drag is a question: the band it takes its size from is about more than the one dragged. */
function comes(resized: Resized): string {
  return `that ${resized.axis} takes its size from a band over more than one, so there is more than one way to change it`;
}
