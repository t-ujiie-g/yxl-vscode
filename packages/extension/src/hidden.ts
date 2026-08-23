import { setHidden } from '@yxl-vscode/intent';
import { spanSaid } from '@yxl-vscode/units';
import type { Hidden } from '@yxl-vscode/webview/protocol';
import { type Asking, asked } from './asked';
import type { Port, Spec } from './write';

/**
 * Columns or rows hidden from the preview, or shown again: §4.4's band rows
 * with `hidden:` where a size would be.
 */
export function hide(spec: Spec, hidden: Hidden, port: Port, choice?: string): Promise<void> {
  return asked(spec, hidden, port, choice, HIDE);
}

const HIDE: Asking<Hidden> = {
  about: (hidden) => ({ ...hidden, kind: 'hide' }),
  answers: (spec, hidden, sheet, read) => setHidden(spec, { ...hidden, sheet }, read),
  nothing: (hidden) =>
    hidden.hidden ? `nothing here can hide ${many(hidden)}` : `nothing hides ${many(hidden)}`,
  why: (hidden) =>
    `${many(hidden)} take that from a band over more than them, so there is more than one way to change it`,
  done: (hidden) => `${many(hidden)} ${hidden.hidden ? 'hidden' : 'shown again'}.`,
};

/** What was named, as the reader is told about it — by the letter on the heading, not by its number. */
function many(hidden: Hidden): string {
  return spanSaid(hidden.axis, hidden.first, hidden.last);
}
