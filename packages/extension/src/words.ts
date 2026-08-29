import { WORDS as compile } from '@yxl-vscode/compile';
import { WORDS as cst } from '@yxl-vscode/cst';
import { reading, type Saying } from '@yxl-vscode/diag';
import { WORDS as intent } from '@yxl-vscode/intent';
import { WORDS as patch } from '@yxl-vscode/patch';
import { WORDS as view } from '@yxl-vscode/webview/text';
import { spoken } from '@yxl-vscode/webview/words';
import { WORDS as host } from './text';

/** Everything this editor can say, in the language a tag names (ADR-051). */
export function reader(tag: string): (saying: Saying) => string {
  return reading(spoken(tag), cst, compile, patch, view, intent, host);
}
