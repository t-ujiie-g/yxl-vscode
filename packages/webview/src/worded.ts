import type { Saying } from '@yxl-vscode/diag';
import { columnLabel } from '@yxl-vscode/units';
import { type Says, say } from './text';
import { reader } from './words';

const held = new Map<string, (saying: Saying) => string>();

/** What the core said, in the language the page is drawn in (ADR-051). */
export function worded(saying: Saying): string {
  const tag = document.documentElement.lang;
  const found = held.get(tag) ?? reader(tag);
  held.set(tag, found);
  return found(saying);
}

/** The same, as the panel shows it: prose without the backticks a spec's own words are written in. */
export function plainly(saying: Saying): string {
  return worded(saying).replace(/`/g, '');
}

/** One of the panel's own sentences, in the language the page is drawn in (ADR-051). */
export function chrome<K extends keyof Says & string>(
  id: K,
  ...args: keyof Says[K] extends never ? [] : [Says[K]]
): string {
  return worded(say(id, ...args));
}

/** A run of rows or columns, as a menu names it. */
export function spanned(axis: string, first: number, last: number): string {
  const at = (of: number) => (axis === 'column' ? columnLabel(of) : String(of));
  return first === last
    ? chrome('view.span-one', { axis, at: at(first) })
    : chrome('view.span-many', { axis, from: at(first), to: at(last) });
}
