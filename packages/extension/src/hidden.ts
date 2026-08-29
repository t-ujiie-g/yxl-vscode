import { setHidden } from '@yxl-vscode/intent';
import type { Hidden } from '@yxl-vscode/webview/protocol';
import { type Asking, asked, many } from './asked';
import { say } from './text';
import type { Port, Spec } from './write';

/**
 * Columns or rows hidden from the preview, or shown again: the resolution
 * table's band rows with `hidden:` where a size would be.
 */
export function hide(spec: Spec, hidden: Hidden, port: Port, choice?: string): Promise<void> {
  return asked(spec, hidden, port, choice, HIDE);
}

const HIDE: Asking<Hidden> = {
  about: (hidden) => ({ ...hidden, kind: 'hide' }),
  answers: (spec, hidden, sheet, read) => setHidden(spec, { ...hidden, sheet }, read),
  nothing: (hidden) =>
    hidden.hidden ? say('host.cannot-hide', many(hidden)) : say('host.nothing-hides', many(hidden)),
  why: (hidden) => say('host.band-over-more', many(hidden)),
  done: (hidden) =>
    hidden.hidden ? say('host.hidden-done', many(hidden)) : say('host.shown-done', many(hidden)),
};
