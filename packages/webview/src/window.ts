import type { Axis } from '@yxl-vscode/spec';
import type { DrawnSheet, Sized } from './protocol';

/** Excel's own units: a width counts `0`s, seven pixels of one at 96 DPI, and a point is 4/3 of a pixel. */
const PER_CHARACTER = 7;
const PER_POINT = 4 / 3;

/** What a cell keeps around its text: two pixels either side and the gridline, so 8.43 draws as 64. */
export const PADDING = 5;

/** A point as the page draws it: a spec says a splitter and a line weight in points, CSS counts pixels. */
export function pixelsOf(points: number): number {
  return points * PER_POINT;
}

/** The smallest a drag may leave a column or a row, so the grip it was dragged by stays there. */
const LEAST = { column: 1, row: 6 };

/**
 * A dragged size in the units a spec writes it in — character units across,
 * points down (`docs/spec.md` §4) — to the two places a reader would read.
 */
export function sizeOf(axis: Axis, px: number): number {
  const size = axis === 'column' ? (px - PADDING) / PER_CHARACTER : px / PER_POINT;
  return Math.max(LEAST[axis], Math.round(size * 100) / 100);
}

/** Where the scroller has been left, in pixels from the sheet's top-left. */
export interface Where {
  readonly top: number;
  readonly left: number;
}

/** A row's height in pixels; hidden is nothing, and unset is Excel's default or what the row was fitted to. */
export function heightOf(sheet: DrawnSheet, row: number): number {
  return sizeAt(laid(sheet).row, row);
}

/** A column's width in pixels; hidden is nothing, and unset is Excel's default. */
export function widthOf(sheet: DrawnSheet, col: number): number {
  return sizeAt(laid(sheet).column, col);
}

const DEFAULT = { height: 15, width: 8.43 };

/** Where a row's top edge sits, in pixels from the sheet's own top. */
export function down(sheet: DrawnSheet, row: number): number {
  return edgeAt(laid(sheet).row, row);
}

/** The same across, for a column's left edge. */
export function across(sheet: DrawnSheet, col: number): number {
  return edgeAt(laid(sheet).column, col);
}

/**
 * The rows a spec leaves unsized that the view measured taller than Excel's
 * default, in pixels: Excel fits such a row to its tallest cell anywhere along it.
 */
export function grow(sheet: DrawnSheet, rows: ReadonlyMap<number, number>): void {
  grown.set(sheet, rows);
  lines.delete(sheet);
}

const grown = new WeakMap<DrawnSheet, ReadonlyMap<number, number>>();

/** The size of every line of one axis to the sheet's extent, and the edge each one starts at. */
interface Lines {
  readonly size: Float64Array;
  readonly edge: Float64Array;
  readonly fallback: number;
}

const lines = new WeakMap<DrawnSheet, { readonly row: Lines; readonly column: Lines }>();

function laid(sheet: DrawnSheet): { readonly row: Lines; readonly column: Lines } {
  const had = lines.get(sheet);
  if (had !== undefined) return had;

  const fitted = grown.get(sheet);
  const made = {
    row: measured(sheet.of.rows, sheet.heights, DEFAULT.height * PER_POINT, (run) =>
      run.size === null ? null : run.size * PER_POINT,
    ),
    column: measured(
      sheet.of.columns,
      sheet.widths,
      DEFAULT.width * PER_CHARACTER + PADDING,
      (run) => (run.size === null ? null : run.size * PER_CHARACTER + PADDING),
    ),
  };
  if (fitted !== undefined) {
    for (const [row, height] of fitted) {
      if (row >= 1 && row <= sheet.of.rows && unsized(sheet.heights, row)) {
        made.row.size[row] = Math.max(made.row.size[row] ?? 0, height);
      }
    }
    summed(made.row);
  }

  lines.set(sheet, made);
  return made;
}

function measured(
  count: number,
  runs: readonly Sized[],
  fallback: number,
  sized: (run: Sized) => number | null,
): Lines {
  const size = new Float64Array(count + 1).fill(fallback);
  for (const run of runs) {
    const to = Math.min(run.last, count);
    const one = run.hidden ? 0 : (sized(run) ?? fallback);
    for (let at = Math.max(1, run.first); at <= to; at += 1) size[at] = one;
  }

  const made = { size, edge: new Float64Array(count + 2), fallback };
  summed(made);
  return made;
}

function summed(lines: Lines): void {
  for (let at = 1; at < lines.edge.length; at += 1) {
    lines.edge[at] = (lines.edge[at - 1] ?? 0) + (at === 1 ? 0 : (lines.size[at - 1] ?? 0));
  }
}

function sizeAt(lines: Lines, at: number): number {
  return at >= 1 && at < lines.size.length ? (lines.size[at] ?? 0) : lines.fallback;
}

function edgeAt(lines: Lines, at: number): number {
  const last = lines.edge.length - 1;
  if (at <= 1) return 0;
  if (at <= last) return lines.edge[at] ?? 0;

  return (lines.edge[last] ?? 0) + (at - last) * lines.fallback;
}

/** Whether no run gives this row a size or hides it, which is what leaves it to be fitted. */
function unsized(runs: readonly Sized[], row: number): boolean {
  const run = runs.findLast((one) => row >= one.first && row <= one.last);
  return run === undefined || (run.size === null && !run.hidden);
}

/** The cell a point in the sheet's own pixels falls in, which is where a dragged float lands. */
export function landing(sheet: DrawnSheet, at: Where): { row: number; col: number } {
  return { row: rowAt(sheet, Math.max(0, at.top)), col: columnAt(sheet, Math.max(0, at.left)) };
}

/** The row and the column a scroll position has arrived at. */
function rowAt(sheet: DrawnSheet, top: number): number {
  return lineAt(laid(sheet).row, top);
}

function columnAt(sheet: DrawnSheet, left: number): number {
  return lineAt(laid(sheet).column, left);
}

/** The first line whose far edge is past this point, or the last line where none is. */
function lineAt(lines: Lines, point: number): number {
  const last = lines.size.length - 1;
  let low = 1;
  let high = last;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((lines.edge[middle + 1] ?? Number.POSITIVE_INFINITY) > point) high = middle;
    else low = middle + 1;
  }

  return Math.max(1, low);
}

/**
 * The window to ask the host for from where the reader has scrolled and how much
 * they see, or `null` while the drawn one still covers it. Clamped here the way
 * the host clamps it, or the last window is a question repeated forever.
 */
export function wanted(
  sheet: DrawnSheet,
  at: Where,
  seen: { readonly height: number; readonly width: number } = { height: 0, width: 0 },
): { row: number; col: number } | null {
  const rows = { first: rowAt(sheet, at.top), last: rowAt(sheet, at.top + seen.height) };
  const cols = { first: columnAt(sheet, at.left), last: columnAt(sheet, at.left + seen.width) };

  // Each axis moves only when the reader nears its own edge: one near the
  // other's would redraw at every row scrolled.
  const centred = around(sheet, {
    row: rowAt(sheet, at.top + seen.height / 2),
    col: columnAt(sheet, at.left + seen.width / 2),
  });
  const asked = {
    row: nearing(rows, sheet.at.row, sheet.rows, MARGIN.rows) ? centred.row : sheet.at.row,
    col: nearing(cols, sheet.at.col, sheet.columns, MARGIN.columns) ? centred.col : sheet.at.col,
  };
  return asked.row === sheet.at.row && asked.col === sheet.at.col ? null : asked;
}

function nearing(
  seen: { readonly first: number; readonly last: number },
  at: number,
  many: number,
  margin: number,
): boolean {
  return seen.first < at + margin || seen.last >= at + many - margin;
}

/** The window with this cell at its middle, clamped as the host clamps it. */
export function around(
  sheet: DrawnSheet,
  at: { row: number; col: number },
): { row: number; col: number } {
  const last = {
    row: Math.max(1, sheet.of.rows - sheet.rows + 1),
    col: Math.max(1, sheet.of.columns - sheet.columns + 1),
  };
  return {
    row: Math.min(Math.max(1, at.row - Math.floor(sheet.rows / 2)), last.row),
    col: Math.min(Math.max(1, at.col - Math.floor(sheet.columns / 2)), last.col),
  };
}

const MARGIN = { rows: 20, columns: 5 };
