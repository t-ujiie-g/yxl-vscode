import type { Saying } from '@yxl-vscode/diag';
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
