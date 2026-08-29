import { WORDS as compile } from '@yxl-vscode/compile';
import { WORDS as cst } from '@yxl-vscode/cst';
import { type Book, type Language, reading, type Saying } from '@yxl-vscode/diag';
import { WORDS as loader } from '@yxl-vscode/loader';
import { WORDS as patch } from '@yxl-vscode/patch';
import { WORDS as units } from '@yxl-vscode/units';
import { WORDS as view } from './text';

/** The language a tag names, which is VS Code's own; anything but Japanese reads in English (ADR-051). */
export function spoken(tag: string): Language {
  return tag.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

/**
 * Every book below this one, in the order they were written; an edge that words
 * more than these adds its own to the end (ADR-051).
 */
export const BOOKS: readonly Book[] = [units, cst, loader, compile, patch, view];

/** Everything the core and the panel can say, in the language a tag names (ADR-051). */
export function reader(tag: string): (saying: Saying) => string {
  return reading(spoken(tag), ...BOOKS);
}
