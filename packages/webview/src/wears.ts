import type { Asking } from './cell';
import { HELD } from './keys';
import type { DrawnLink, DrawnNote, DrawnSheet, DrawnTable, DrawnValidation } from './protocol';
import type { Asked } from './showing';

/** Whether this cell is one of the header cells a sheet's filter hangs off (`docs/spec.md` §10). */
export function filters(sheet: DrawnSheet, row: number, col: number): boolean {
  const at = sheet.filter;
  if (at === null) return false;

  return row === at.top && col >= at.left && col <= at.right;
}

/** The table this cell is inside, of the ones the sheet declares (`docs/spec.md` §11). */
export function tableAt(sheet: DrawnSheet, row: number, col: number): DrawnTable | null {
  const over = sheet.tables.find(
    (one) => row >= one.top && row <= one.bottom && col >= one.left && col <= one.right,
  );

  return over ?? null;
}

/** How a cell of a table is banded, with nothing of Excel's own palette (ADR-029). */
export function banding(table: DrawnTable, row: number, col: number): string[] {
  if (row === table.top) return ['tabled', 'heads'];

  const marks = ['tabled'];
  const striped =
    (table.bandedRows && (row - table.top) % 2 === 1) ||
    (table.bandedColumns && (col - table.left) % 2 === 0);
  if (striped) marks.push('banded');
  if (table.firstColumn && col === table.left) marks.push('edging');
  if (table.lastColumn && col === table.right) marks.push('edging');

  return marks;
}

/** A table as its header reads on hover: what formulas call it, since nothing else says so. */
export function tableSaid(table: DrawnTable): string {
  return table.name === null ? 'This row heads a table' : `This row heads the table ${table.name}`;
}

/** The corner Excel puts on a cell that carries a note. */
export function noted(): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'noted';

  return mark;
}

/** The choices a reader typed, which Excel keeps as one comma-joined string (`docs/spec.md` §10). */
export function choicesIn(text: string): string[] {
  return text
    .split(',')
    .map((one) => one.trim())
    .filter((one) => one !== '');
}

/** What the box over a cell asks for, by what the menu opened it for. */
export function asking(
  what: Asked['what'],
  note: DrawnNote | null,
  link: DrawnLink | null,
): Asking {
  if (what === 'note') {
    return { className: 'noting', value: note?.text ?? '', rows: 3, placeholder: 'a note' };
  }
  if (what === 'list') {
    return { className: 'linking', value: '', rows: 1, placeholder: 'Draft, Sent, Paid' };
  }

  const holds = link?.kind === what ? link.target : '';
  const placeholder = what === 'url' ? 'https://example.com' : 'Sheet!A1';

  return { className: 'linking', value: holds, rows: 1, placeholder };
}

/** A link as it reads on hover: the tip the spec wrote, and where the link goes. */
export function linkSaid(link: DrawnLink): string {
  const said = `${HELD}click follows this link: ${link.target}`;
  return link.tip === null ? said : `${link.tip}\n${said}`;
}

/** A note as it reads on hover: the author first, as Excel writes one above the text. */
export function noteSaid(note: DrawnNote): string {
  return note.author === null ? note.text : `${note.author}: ${note.text}`;
}

/** A validated cell's mark: the dropdown a list offers, and a quiet corner for what only asks. */
export function validated(asked: DrawnValidation): HTMLElement {
  const mark = asked.choices === null ? document.createElement('span') : dropdown();
  mark.classList.add('asks');
  if (asked.choices === null) mark.classList.add('asked');

  return mark;
}

/** The mark Excel puts on a filtered header, which says a filter is there and nothing more. */
export function dropdown(): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'dropdown';
  mark.textContent = '▾';

  return mark;
}

export const FILTERED = 'This column has a filter; the preview does not filter by it';

/** What a cell says on hover, drawn beside the cell and fixed to the page: a cell clips what is inside it. */
export function tells(cell: HTMLTableCellElement, lines: readonly string[]): void {
  const said = lines.filter((one) => one !== '').join('\n');
  if (said === '') return;

  cell.setAttribute('aria-label', said);
  cell.addEventListener('mouseenter', () => {
    if (cell.querySelector('.notice') !== null) return;

    const box = document.createElement('div');
    box.className = 'notice';
    box.textContent = said;

    const at = cell.getBoundingClientRect();
    box.style.top = `${at.bottom + 4}px`;
    box.style.left = `${at.left}px`;
    cell.append(box);
  });
  cell.addEventListener('mouseleave', () => cell.querySelector('.notice')?.remove());
}
