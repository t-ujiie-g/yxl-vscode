import { type CompiledSheet, cellAt } from '@yxl-vscode/compile';
import type { Evaluation } from '@yxl-vscode/evaluate';
import { type A1Addr, addrAt, qualified, type Rect } from '@yxl-vscode/units';

/**
 * A rectangle as tab-separated text, for a copy the view cannot make because it
 * reaches past the window it draws (ADR-019, ADR-035). The values are the
 * evaluated ones, as the grid shows them, and display only (ADR-014).
 */
export function asText(sheet: CompiledSheet, rect: Rect, evaluation: Evaluation | null): string {
  const lines: string[] = [];

  for (let row = rect.top; row <= rect.bottom; row += 1) {
    const fields: string[] = [];
    for (let col = rect.left; col <= rect.right; col += 1) {
      fields.push(field(held(sheet, addrAt({ col, row }), evaluation)));
    }
    lines.push(fields.join('\t'));
  }

  return lines.join('\n');
}

/** What one cell copies as: what it comes to, then what it holds, then the formula itself. */
function held(sheet: CompiledSheet, at: A1Addr, evaluation: Evaluation | null): string {
  const cell = cellAt(sheet, at);
  if (cell === null) return '';

  const computed = evaluation?.values.get(qualified(sheet.name, at)) ?? null;
  if (computed?.kind === 'error') return computed.error;
  if (computed?.kind === 'value') return computed.value === null ? '' : String(computed.value);
  if (cell.value !== null) return String(cell.value);
  if (cell.rich !== null) return cell.rich.map((run) => run.text).join('');

  return cell.formula === null ? '' : `=${cell.formula}`;
}

/** A field as a spreadsheet reads one back: quoted where it holds what a row or a field ends on. */
function field(text: string): string {
  if (!/["\t\r\n]/.test(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
}
