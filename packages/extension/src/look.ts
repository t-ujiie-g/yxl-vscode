import { type Candidate, reading, setStyle } from '@yxl-vscode/intent';
import { type Rect, sheetName } from '@yxl-vscode/units';
import type { Worn } from '@yxl-vscode/webview/protocol';
import { applied, type Port, type Spec, shown } from './write';

/**
 * A look asked for over a rectangle, all the way to the file: the answers are
 * §4.4's `setStyle` table, every write goes through the normalizer (ADR-008,
 * ADR-037), and one answer that is the whole answer applies without asking.
 */
export async function wear(spec: Spec, worn: Worn, port: Port, choice?: string): Promise<void> {
  const sheet = sheetName(worn.sheet);
  if (sheet === null) {
    port.refuse(`\`${worn.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const read = reading(port.text);
  const where = { sheet, rect: rectOf(worn) };
  const answers = setStyle({ grid: spec.grid }, where, worn.want, read);

  if (answers.length === 0) {
    port.refuse('nothing here can carry that look', null);
    return;
  }

  const sole = answers.length === 1 ? answers[0] : undefined;
  const taken = choice === undefined ? sole : answers.find((one) => one.id === choice);

  if (taken === undefined || (choice === undefined && taken.alone !== true)) {
    if (choice !== undefined) {
      port.refuse('that answer is no longer one of the ways this edit could be made', null);
      return;
    }

    port.refuse(comes(answers), {
      about: { is: 'worn', worn },
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
  if (done) port.said(`${taken.moves.length} cell${taken.moves.length === 1 ? '' : 's'} restyled.`);
}

/** Why a look is a question: something other than these cells says how they look. */
function comes(answers: readonly Candidate[]): string {
  if (answers.some((one) => one.id === 'all' || one.id === 'split')) {
    return 'the cells here take that look from different places, so there is more than one way to change it';
  }

  const shared = answers.find((one) => one.id !== 'onCells');
  const many = shared?.moves.length ?? 0;

  return `this look comes from something ${many} cell${many === 1 ? '' : 's'} read, so there is more than one way to change it`;
}

function rectOf(worn: Worn): Rect {
  return { top: worn.top, left: worn.left, bottom: worn.bottom, right: worn.right };
}
