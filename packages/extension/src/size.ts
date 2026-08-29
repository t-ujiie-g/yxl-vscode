import { setSize } from '@yxl-vscode/intent';
import type { Resized } from '@yxl-vscode/webview/protocol';
import { type Asking, asked, many } from './asked';
import { say } from './text';
import type { Port, Spec } from './write';

/**
 * A column or a row dragged to a size: the answers are the `setSize` table's,
 * so a band that reaches past the one dragged is asked about rather than taken.
 */
export function resize(spec: Spec, resized: Resized, port: Port, choice?: string): Promise<void> {
  return asked(spec, resized, port, choice, SIZE);
}

const SIZE: Asking<Resized> = {
  about: (resized) => ({ ...resized, kind: 'resize' }),
  answers: (spec, resized, sheet, read) => setSize(spec, { ...resized, sheet }, read),
  nothing: (resized) => say('host.no-width-here', many(resized)),
  why: (resized) => say('host.size-from-a-band', many(resized)),
  done: (resized) => say('host.resized', many(resized)),
};
