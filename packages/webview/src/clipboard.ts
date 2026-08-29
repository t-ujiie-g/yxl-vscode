import type { Rect } from '@yxl-vscode/units';
import { fillOf, shown, styleText } from './cell';
import { tabbed } from './fields';
import type { DrawnCell, DrawnSheet } from './protocol';

/** What a copied rectangle puts on the clipboard: the values as text, the look as a table (ADR-028). */
export interface Flavours {
  readonly text: string;
  readonly html: string;
}

/**
 * The rectangle as Excel and Sheets read one, or `null` where it reaches past
 * what the preview has drawn and half of it would be silently blank.
 */
export function flavours(sheet: DrawnSheet, rect: Rect): Flavours | null {
  const far = { row: sheet.at.row + sheet.rows - 1, col: sheet.at.col + sheet.columns - 1 };
  const drawn =
    rect.top >= sheet.at.row &&
    rect.left >= sheet.at.col &&
    rect.bottom <= far.row &&
    rect.right <= far.col;
  if (!drawn) return null;

  const held = new Map(sheet.cells.map((one) => [`${one.col}:${one.row}`, one]));
  const rows: string[] = [];

  for (let row = rect.top; row <= rect.bottom; row += 1) {
    const cells: string[] = [];
    for (let col = rect.left; col <= rect.right; col += 1)
      cells.push(td(held.get(`${col}:${row}`)));

    rows.push(`<tr>${cells.join('')}</tr>`);
  }

  return { text: tabbed(sheet.cells, rect), html: `<table>${rows.join('')}</table>` };
}

/**
 * The flavours onto the clipboard, inside the gesture that asked for them, or
 * `false` where the page could not reach it. `execCommand` is deprecated and
 * still the only *synchronous* way to put more than one flavour there.
 */
export function onto(what: Flavours): boolean {
  const write = (event: ClipboardEvent): void => {
    event.clipboardData?.setData('text/plain', what.text);
    event.clipboardData?.setData('text/html', what.html);
    event.preventDefault();
  };

  document.addEventListener('copy', write as EventListener, { once: true });
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.removeEventListener('copy', write as EventListener);
  }
}

/** One cell as the other spreadsheets read one; the fill goes on twice, because Excel reads `bgcolor` and Sheets the CSS. */
function td(cell: DrawnCell | undefined): string {
  if (cell === undefined) return '<td></td>';

  const css = styleText(cell.style);
  const fill = fillOf(cell.style);
  const open = [
    '<td',
    fill === null ? '' : ` bgcolor="${fill}"`,
    css === '' ? '' : ` style="${escaped(css)}"`,
    '>',
  ].join('');

  return `${open}${escaped(shown(cell))}</td>`;
}

function escaped(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
