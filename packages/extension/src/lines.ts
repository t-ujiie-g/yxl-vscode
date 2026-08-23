import { setLine } from '@yxl-vscode/intent';
import type { Lined } from '@yxl-vscode/webview/protocol';
import { type Asking, asked, many } from './asked';
import type { Port, Spec } from './write';

/**
 * Rows or columns put in, or taken away, all the way to the file: every
 * construct the line reaches moves with it (§4.4), and the count is in front of
 * the reader where it is more than a handful.
 */
export function line(spec: Spec, lined: Lined, port: Port, choice?: string): Promise<void> {
  return asked(spec, lined, port, choice, LINE);
}

const LINE: Asking<Lined> = {
  about: (lined) => ({ ...lined, kind: 'line' }),
  answers: (spec, lined, sheet, read) => setLine(spec, { ...lined, sheet }, read),
  nothing: (lined) => `nothing here moves when ${run(lined)} is drawn`,
  why: (_lined, answers) =>
    `this moves more than a handful of things, so it is worth seeing first: ${answers[0]?.what ?? ''}`,
  done: (lined) => `${run(lined)} ${lined.by < 0 ? 'taken away' : 'put in'}.`,
};

/** The run the gesture named, as the reader is told about it. */
function run(lined: Lined): string {
  const last = lined.by < 0 ? lined.at - lined.by - 1 : lined.at + lined.by - 1;
  return many({ axis: lined.axis, first: lined.at, last });
}
