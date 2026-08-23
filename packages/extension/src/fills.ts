import { setFilled } from '@yxl-vscode/intent';
import type { Filled } from '@yxl-vscode/webview/protocol';
import { type Asking, asked } from './asked';
import type { Port, Spec } from './write';

/**
 * A rectangle filled from its first line, all the way to the file: a spec's own
 * answer is one `formulas:` range, which is what Excel's fill makes of a
 * formula too, so the two are offered and the reader picks (ADR-001).
 */
export function fill(spec: Spec, filled: Filled, port: Port, choice?: string): Promise<void> {
  return asked(spec, filled, port, choice, FILL);
}

const FILL: Asking<Filled> = {
  about: (filled) => ({ ...filled, kind: 'fill' }),
  answers: (spec, filled, sheet, read) => {
    const { top, left, bottom, right } = filled;
    return setFilled(spec, { sheet, rect: { top, left, bottom, right }, axis: filled.axis }, read);
  },
  nothing: (filled) =>
    `nothing on the first ${filled.axis === 'row' ? 'row' : 'column'} of this is written, so there is nothing to fill`,
  why: () => 'a spec can hold this as one range or as a cell each, so it is worth saying which',
  done: (_filled, taken) => `${taken.what.replace(/^W/, 'w')}: done.`,
};
