import type { Saying } from '@yxl-vscode/diag';
import { type Candidate, setStyle } from '@yxl-vscode/intent';
import type { Rect } from '@yxl-vscode/units';
import type { Worn } from '@yxl-vscode/webview/protocol';
import { type Asking, asked } from './asked';
import { say } from './text';
import type { Port, Spec } from './write';

/**
 * A look asked for over a rectangle: the answers are the `setStyle` table's,
 * and every write goes through the normalizer (ADR-008, ADR-037).
 */
export function wear(spec: Spec, worn: Worn, port: Port, choice?: string): Promise<void> {
  return asked(spec, worn, port, choice, LOOK);
}

const LOOK: Asking<Worn> = {
  about: (worn) => ({ ...worn, kind: 'wear' }),
  answers: (spec, worn, sheet, read) =>
    setStyle(spec, { sheet, rect: rectOf(worn), whole: worn.whole }, worn.want, read),
  nothing: () => say('host.no-look-here'),
  why: (_worn, answers) => comes(answers),
  done: (_worn, taken) => say('host.restyled', { many: taken.moves.length }),
};

/** Why a look is a question: something other than these cells says how they look. */
function comes(answers: readonly Candidate[]): Saying {
  if (answers.some((one) => one.id === 'exception')) return say('host.look-is-an-exception');
  if (answers.some((one) => one.id === 'all' || one.id === 'split')) {
    return say('host.look-from-different-places');
  }

  const shared = answers.find((one) => one.id !== 'onCells');

  return say('host.look-is-shared', { many: shared?.moves.length ?? 0 });
}

function rectOf(worn: Worn): Rect {
  return { top: worn.top, left: worn.left, bottom: worn.bottom, right: worn.right };
}
