import { setLine } from '@yxl-vscode/intent';
import type { Lined } from '@yxl-vscode/webview/protocol';
import { type Asking, asked, many } from './asked';
import { say } from './text';
import type { Port, Spec } from './write';

/**
 * Rows or columns put in, or taken away, all the way to the file: every
 * construct the line reaches moves with it, and the count is in front of
 * the reader where it is more than a handful.
 */
export function line(spec: Spec, lined: Lined, port: Port, choice?: string): Promise<void> {
  return asked(spec, lined, port, choice, LINE);
}

const LINE: Asking<Lined> = {
  about: (lined) => ({ ...lined, kind: 'line' }),
  answers: (spec, lined, sheet, read) => setLine(spec, { ...lined, sheet }, read),
  nothing: (lined) => say('host.nothing-moves', { span: run(lined) }),
  why: (_lined, answers) =>
    say('host.moves-a-lot', {
      what: answers[0]?.what ?? '',
      keys: answers[0]?.keys ?? 0,
    }),
  done: (lined) =>
    lined.by < 0
      ? say('host.lines-taken-away', { span: run(lined) })
      : say('host.lines-put-in', { span: run(lined) }),
};

/** The run the gesture named, as the reader is told about it. */
function run(lined: Lined): string {
  const last = lined.by < 0 ? lined.at - lined.by - 1 : lined.at + lined.by - 1;
  return many({ axis: lined.axis, first: lined.at, last });
}
