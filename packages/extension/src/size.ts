import { setSize } from '@yxl-vscode/intent';
import type { Resized } from '@yxl-vscode/webview/protocol';
import { type Asking, asked, many } from './asked';
import type { Port, Spec } from './write';

/**
 * A column or a row dragged to a size: the answers are §4.4's `setSize` table,
 * so a band that reaches past the one dragged is asked about rather than taken.
 */
export function resize(spec: Spec, resized: Resized, port: Port, choice?: string): Promise<void> {
  return asked(spec, resized, port, choice, SIZE);
}

const SIZE: Asking<Resized> = {
  about: (resized) => ({ ...resized, kind: 'resize' }),
  answers: (spec, resized, sheet, read) => setSize(spec, { ...resized, sheet }, read),
  nothing: (resized) => `nothing here can say how wide ${many(resized)} is`,
  why: (resized) =>
    `${many(resized)} takes its size from a band over more than that, so there is more than one way to change it`,
  done: (resized) => `${many(resized)} resized.`.replace(/^./, (one) => one.toUpperCase()),
};
