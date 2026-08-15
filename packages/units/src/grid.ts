import type { A1Addr, A1Range } from './a1';
import type { ColumnSpan, RowSpan } from './band';

/**
 * A cell as two 1-based numbers, where `A1` is column 1 row 1.
 *
 * Addresses are text in a spec and arithmetic in a grid; this is the second
 * form, and the two conversions below are the only place either is spelled.
 */
export interface CellRef {
  readonly col: number;
  readonly row: number;
}

/** An inclusive rectangle, its corners in reading order however they were written. */
export interface Rect {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

/** An inclusive run of columns or of rows. */
export interface Band {
  readonly first: number;
  readonly last: number;
}

/** Where an address sits. Total: the brand is only given to text that parses. */
export function cellOf(addr: A1Addr): CellRef {
  const letters = /^[A-Z]+/.exec(addr)?.[0] ?? '';
  return { col: columnIndex(letters), row: Number(addr.slice(letters.length)) };
}

/** The address of a position. */
export function addrAt(cell: CellRef): A1Addr {
  return `${columnLabel(cell.col)}${cell.row}` as A1Addr;
}

/** The rectangle a range covers, whichever corners it named. */
export function rectOf(range: A1Range): Rect {
  const colon = range.indexOf(':');
  const from = cellOf(range.slice(0, colon) as A1Addr);
  const to = cellOf(range.slice(colon + 1) as A1Addr);

  return {
    top: Math.min(from.row, to.row),
    left: Math.min(from.col, to.col),
    bottom: Math.max(from.row, to.row),
    right: Math.max(from.col, to.col),
  };
}

/** The columns a `columns:` band selects. */
export function columnsOf(span: ColumnSpan): Band {
  const [first, last] = endpoints(span);
  return { first: columnIndex(first), last: columnIndex(last ?? first) };
}

/** The rows a `rows:` band selects. */
export function rowsOf(span: RowSpan): Band {
  const [first, last] = endpoints(span);
  return { first: Number(first), last: Number(last ?? first) };
}

/** Whether a cell is inside a rectangle. */
export function within(cell: CellRef, rect: Rect): boolean {
  return (
    cell.col >= rect.left &&
    cell.col <= rect.right &&
    cell.row >= rect.top &&
    cell.row <= rect.bottom
  );
}

/**
 * A selector's two ends, `null` where it named only one.
 *
 * It splits on the *first* `-`, so `B-` has an empty end rather than none —
 * which is what makes `parseColumnSpan` refuse it.
 */
export function endpoints(span: string): [string, string | null] {
  const dash = span.indexOf('-');
  return dash < 0 ? [span, null] : [span.slice(0, dash), span.slice(dash + 1)];
}

/** A column label as its 1-based index, in Excel's bijective base 26. */
export function columnIndex(label: string): number {
  let index = 0;
  for (const letter of label) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index;
}

/** The inverse: 1 is `A`, 27 is `AA`. */
function columnLabel(index: number): string {
  let label = '';
  for (let left = index; left > 0; left = Math.floor((left - 1) / 26)) {
    label = String.fromCharCode(65 + ((left - 1) % 26)) + label;
  }
  return label;
}
