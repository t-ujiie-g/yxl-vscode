import { setGroup } from '@yxl-vscode/intent';
import { spanSaid } from '@yxl-vscode/units';
import type { Grouped } from '@yxl-vscode/webview/protocol';
import { type Asking, asked } from './asked';
import type { Port, Spec } from './write';

/**
 * Columns or rows put into an outline, or taken out of one: §4.4's band rows
 * with `group:` where a size would be.
 */
export function group(spec: Spec, grouped: Grouped, port: Port, choice?: string): Promise<void> {
  return asked(spec, grouped, port, choice, GROUP);
}

const GROUP: Asking<Grouped> = {
  about: (grouped) => ({ ...grouped, kind: 'group' }),
  answers: (spec, grouped, sheet, read) =>
    setGroup({ grid: spec.grid }, { ...grouped, sheet }, read),
  nothing: (grouped) =>
    grouped.level === 0
      ? `nothing groups ${many(grouped)}`
      : `nothing here can group ${many(grouped)}`,
  why: (grouped) =>
    `${many(grouped)} take that from a band over more than them, so there is more than one way to change it`,
  done: (grouped) =>
    `${many(grouped)} ${grouped.level === 0 ? 'taken out of the outline' : 'grouped'}.`,
};

/** What was named, as the reader is told about it — by the letter on the heading, not by its number. */
function many(grouped: Grouped): string {
  return spanSaid(grouped.axis, grouped.first, grouped.last);
}
