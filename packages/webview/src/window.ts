import type { Axis } from '@yxl-vscode/spec';
import type { DrawnSheet, Sized } from './protocol';

/** Excel's own units, as CSS: a character width is about 7px, a point is 4/3 of one. */
const PER_CHARACTER = 7;
const PER_POINT = 4 / 3;

/** The smallest a drag may leave a column or a row, so the grip it was dragged by stays there. */
const LEAST = { column: 1, row: 6 };

/**
 * A dragged size in the units a spec writes it in — character units across,
 * points down (`docs/spec.md` §4) — to the two places a reader would read.
 */
export function sizeOf(axis: Axis, px: number): number {
  const size = px / (axis === 'column' ? PER_CHARACTER : PER_POINT);
  return Math.max(LEAST[axis], Math.round(size * 100) / 100);
}

/** Where the scroller has been left, in pixels from the sheet's top-left. */
export interface Where {
  readonly top: number;
  readonly left: number;
}

/** A row's height in pixels; hidden is nothing, and unset is Excel's default. */
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
function rowAt(sheet: DrawnSheet, top: number): number {
  let sum = 0;
  for (let at = 1; at <= sheet.of.rows; at += 1) {
    sum += heightOf(sheet, at);
    if (sum > top) return at;
  }
  return sheet.of.rows;
}

function columnAt(sheet: DrawnSheet, left: number): number {
  let sum = 0;
  for (let at = 1; at <= sheet.of.columns; at += 1) {
    sum += widthOf(sheet, at);
    if (sum > left) return at;
  }
  return sheet.of.columns;
}

/**
 * The window to ask the host for from where the reader has scrolled, or `null`
 * while the drawn one still covers it. Clamped here the way the host clamps it,
 * or the last window is a question repeated forever.
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

  const last = {
    row: Math.max(1, sheet.of.rows - sheet.rows + 1),
    col: Math.max(1, sheet.of.columns - sheet.columns + 1),
  };
  const asked = {
    row: Math.min(Math.max(1, row - Math.floor(sheet.rows / 2)), last.row),
    col: Math.min(Math.max(1, col - Math.floor(sheet.columns / 2)), last.col),
  };
  return asked.row === sheet.at.row && asked.col === sheet.at.col ? null : asked;
}

const MARGIN = { rows: 20, columns: 5 };

/** The last run covering this row or column, since a later band overrides an earlier one. */
function sized(runs: readonly Sized[], at: number): Sized | undefined {
  return runs.findLast((run) => at >= run.first && at <= run.last);
}
