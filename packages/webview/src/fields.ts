import type { Rect } from '@yxl-vscode/units';
import type { DrawnCell } from './protocol';

/**
 * A rectangle of drawn cells as the tab-separated text every spreadsheet reads
 * (ADR-028). The view copies what it has drawn and the host draws what the view
 * has not, so the two go through here rather than agreeing by hand.
 */
export function tabbed(cells: readonly DrawnCell[], rect: Rect): string {
  const held = new Map(cells.map((one) => [`${one.col}:${one.row}`, one]));
  const lines: string[] = [];

  for (let row = rect.top; row <= rect.bottom; row += 1) {
    const fields: string[] = [];
    for (let col = rect.left; col <= rect.right; col += 1) {
      fields.push(field(plain(held.get(`${col}:${row}`))));
    }
    lines.push(fields.join('\t'));
  }

  return lines.join('\n');
}

/** What one cell copies as: what it comes to, then what it holds, then the formula itself. */
export function plain(cell: DrawnCell | undefined): string {
  if (cell === undefined) return '';

  const computed = cell.computed;
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
