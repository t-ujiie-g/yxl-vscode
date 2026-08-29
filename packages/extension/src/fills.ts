import { setFilled } from '@yxl-vscode/intent';
import type { Filled } from '@yxl-vscode/webview/protocol';
import { type Asking, asked } from './asked';
import { say } from './text';
import { type Port, rectIn, type Spec } from './write';

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
  answers: (spec, filled, sheet, read) =>
    setFilled(spec, { sheet, rect: rectIn(filled), axis: filled.axis }, read),
  nothing: (filled) => say('host.nothing-to-fill', { axis: filled.axis }),
  why: () => say('host.one-range-or-each'),
  done: (_filled, taken) => say('host.fill-done', { what: taken.what }),
};
