import type { CompiledSheet } from '@yxl-vscode/compile';
import type { Evaluation } from '@yxl-vscode/evaluate';
import type { Rect } from '@yxl-vscode/units';
import { tabbed } from '@yxl-vscode/webview/fields';
import { drawOver } from './drawing';

/**
 * A rectangle as tab-separated text, for a copy that reaches past the window
 * the view draws (ADR-019, ADR-035). The cells are drawn as the view draws
 * them, so what lands is what it would have put there.
 */
export function asText(sheet: CompiledSheet, rect: Rect, evaluation: Evaluation | null): string {
  return tabbed(drawOver(sheet, rect, evaluation), rect);
}
