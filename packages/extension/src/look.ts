import { type Candidate, setStyle } from '@yxl-vscode/intent';
import type { Rect } from '@yxl-vscode/units';
import type { Worn } from '@yxl-vscode/webview/protocol';
import { type Asking, asked } from './asked';
import type { Port, Spec } from './write';

/**
 * A look asked for over a rectangle: the answers are §4.4's `setStyle` table,
 * and every write goes through the normalizer (ADR-008, ADR-037).
 */
export function wear(spec: Spec, worn: Worn, port: Port, choice?: string): Promise<void> {
  return asked(spec, worn, port, choice, LOOK);
}

const LOOK: Asking<Worn> = {
  about: (worn) => ({ ...worn, kind: 'wear' }),
  answers: (spec, worn, sheet, read) =>
    setStyle(spec, { sheet, rect: rectOf(worn), whole: worn.whole }, worn.want, read),
  nothing: () => 'nothing here can carry that look',
  why: (_worn, answers) => comes(answers),
  done: (_worn, taken) =>
    `${taken.moves.length} cell${taken.moves.length === 1 ? '' : 's'} restyled.`,
};

/** Why a look is a question: something other than these cells says how they look. */
function comes(answers: readonly Candidate[]): string {
  if (answers.some((one) => one.id === 'exception')) {
    return 'a formula range fills this cell, so a look on it is either an exception or the whole run';
  }
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
