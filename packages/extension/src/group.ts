import { setGroup } from '@yxl-vscode/intent';
import type { Grouped } from '@yxl-vscode/webview/protocol';
import { type Asking, asked, many } from './asked';
import { say } from './text';
import type { Port, Spec } from './write';

/**
 * Columns or rows put into an outline, or taken out of one: the resolution
 * table's band rows with `group:` where a size would be.
 */
export function group(spec: Spec, grouped: Grouped, port: Port, choice?: string): Promise<void> {
  return asked(spec, grouped, port, choice, GROUP);
}

const GROUP: Asking<Grouped> = {
  about: (grouped) => ({ ...grouped, kind: 'group' }),
  answers: (spec, grouped, sheet, read) => setGroup(spec, { ...grouped, sheet }, read),
  nothing: (grouped) =>
    grouped.level === 0
      ? say('host.nothing-groups', { span: many(grouped) })
      : say('host.cannot-group', { span: many(grouped) }),
  why: (grouped) => say('host.band-over-more', { span: many(grouped) }),
  done: (grouped) =>
    grouped.level === 0
      ? say('host.ungrouped-done', { span: many(grouped) })
      : say('host.grouped-done', { span: many(grouped) }),
};
