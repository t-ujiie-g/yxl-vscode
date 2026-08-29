import { WORDS as cst } from '@yxl-vscode/cst';
import { type Language, reading, type Saying } from '@yxl-vscode/diag';
import { WORDS as patch } from '@yxl-vscode/patch';

/** The language a tag names, which is VS Code's own; anything but Japanese reads in English (ADR-051). */
export function spoken(tag: string): Language {
  return tag.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

/** Everything the core can say, in the language a tag names (ADR-051). */
export function reader(tag: string): (saying: Saying) => string {
  return reading(spoken(tag), cst, patch);
}
