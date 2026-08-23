import { type CompiledSheet, cellAt } from '@yxl-vscode/compile';
import type { Evaluation } from '@yxl-vscode/evaluate';
import { addrAt, qualified, type Rect } from '@yxl-vscode/units';
import type { Summed } from '@yxl-vscode/webview/protocol';

/**
 * What a rectangle comes to: what holds anything, what of that is a number, and
 * their sum — over the evaluated values, and display only (ADR-014).
 */
export function summed(
  sheet: CompiledSheet,
  rect: Rect,
  evaluation: Evaluation | null,
): Omit<Summed, 'kind' | 'sheet'> {
  let held = 0;
  let numbers = 0;
  let sum = 0;

  for (let row = rect.top; row <= rect.bottom; row += 1) {
    for (let col = rect.left; col <= rect.right; col += 1) {
      const at = addrAt({ col, row });
      const cell = cellAt(sheet, at);
      if (cell === null) continue;

      const computed = evaluation?.values.get(qualified(sheet.name, at)) ?? null;
      const value = computed?.kind === 'value' ? computed.value : cell.value;
      if (value === null && cell.formula === null && cell.rich === null) continue;

      held += 1;
      if (typeof value !== 'number') continue;

      numbers += 1;
      sum += value;
    }
  }

  return { held, numbers, sum };
}
