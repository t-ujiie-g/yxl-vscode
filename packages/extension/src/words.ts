import { reading, type Saying } from '@yxl-vscode/diag';
import { WORDS as intent } from '@yxl-vscode/intent';
import { BOOKS, spoken } from '@yxl-vscode/webview/words';
import { WORDS as host } from './text';

/** Everything this editor can say, in the language a tag names; the host has two books of its own (ADR-051). */
export function reader(tag: string): (saying: Saying) => string {
  return reading(spoken(tag), ...BOOKS, intent, host);
}
