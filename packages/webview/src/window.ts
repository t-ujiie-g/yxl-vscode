import type { DrawnSheet, Sized } from './protocol';

/** Excel's own units, as CSS: a character width is about 7px, a point is 4/3 of one. */
const PER_CHARACTER = 7;
const PER_POINT = 4 / 3;

/** Where the scroller has been left, in pixels from the sheet's top-left. */
export interface Where {
  readonly top: number;
  readonly left: number;
}

/**
 * A row's height and a column's width, in pixels.
 *
 * A hidden band is nothing across, which is what hidden means; a band that set
 * no size takes Excel's default — 15 points of height, 8.43 characters of
 * width.
 */
export function heightOf(sheet: DrawnSheet, row: number): number {
  const run = sized(sheet.heights, row);
  if (run?.hidden === true) return 0;
  return (run?.size ?? DEFAULT.height) * PER_POINT;
}

export function widthOf(sheet: DrawnSheet, col: number): number {
  const run = sized(sheet.widths, col);
  if (run?.hidden === true) return 0;
  return (run?.size ?? DEFAULT.width) * PER_CHARACTER;
}

const DEFAULT = { height: 15, width: 8.43 };

/** Where a row's top edge sits, in pixels from the sheet's own top. */
export function down(sheet: DrawnSheet, row: number): number {
  let sum = 0;
  for (let at = 1; at < row; at += 1) sum += heightOf(sheet, at);
  return sum;
}

/** The same across, for a column's left edge. */
export function across(sheet: DrawnSheet, col: number): number {
  let sum = 0;
  for (let at = 1; at < col; at += 1) sum += widthOf(sheet, at);
  return sum;
}

/** The row and the column a scroll position has arrived at. */
export function rowAt(sheet: DrawnSheet, top: number): number {
  let sum = 0;
  for (let at = 1; at <= sheet.of.rows; at += 1) {
    sum += heightOf(sheet, at);
    if (sum > top) return at;
  }
  return sheet.of.rows;
}

export function columnAt(sheet: DrawnSheet, left: number): number {
  let sum = 0;
  for (let at = 1; at <= sheet.of.columns; at += 1) {
    sum += widthOf(sheet, at);
    if (sum > left) return at;
  }
  return sheet.of.columns;
}

/**
 * The window to ask the host for from where the reader has scrolled to, or
 * `null` while the drawn one still covers it.
 *
 * The margin is what keeps this from asking on every scrolled row: a new window
 * is wanted only on nearing an edge of the drawn one, and it is asked for
 * centred on the reader, so the next ask is a long way off in either direction.
 */
export function wanted(sheet: DrawnSheet, at: Where): { row: number; col: number } | null {
  const row = rowAt(sheet, at.top);
  const col = columnAt(sheet, at.left);

  const near =
    row < sheet.at.row + MARGIN.rows ||
    row >= sheet.at.row + sheet.rows - MARGIN.rows ||
    col < sheet.at.col + MARGIN.columns ||
    col >= sheet.at.col + sheet.columns - MARGIN.columns;
  if (!near) return null;

  const asked = {
    row: Math.max(1, row - Math.floor(sheet.rows / 2)),
    col: Math.max(1, col - Math.floor(sheet.columns / 2)),
  };
  return asked.row === sheet.at.row && asked.col === sheet.at.col ? null : asked;
}

const MARGIN = { rows: 20, columns: 5 };

/** The last run covering this row or column, since a later band overrides an earlier one. */
function sized(runs: readonly Sized[], at: number): Sized | undefined {
  return runs.findLast((run) => at >= run.first && at <= run.last);
}
