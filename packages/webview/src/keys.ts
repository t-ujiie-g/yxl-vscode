import type { DrawnCell, DrawnSheet } from './protocol';

/** A cell of the grid, as the view points at one. */
export interface At {
  readonly row: number;
  readonly col: number;
}

/** Where a key would take the selection, and whether it takes the range with it. */
export interface Going {
  readonly to: At;
  readonly extend: boolean;
}

/**
 * Where a key moves the reader, or `null` where it moves them nowhere.
 *
 * The keys a spreadsheet moves by, which is the difference between a grid
 * somebody reads and a grid somebody works in: arrows by one, tab across, page
 * by a window's worth, `Cmd`+arrow to the edge of a block, `Home` and `End`
 * along the row. Holding `Shift` takes the selection with it rather than
 * leaving it behind, exactly as it does in Excel and in Sheets.
 */
export function going(
  event: KeyboardEvent,
  sheet: DrawnSheet,
  held: ReadonlyMap<string, DrawnCell>,
  from: At,
): Going | null {
  const jump = event.metaKey || event.ctrlKey;
  const extend = event.shiftKey;

  if (event.key === 'Home') {
    return { to: jump ? { row: 1, col: 1 } : { row: from.row, col: 1 }, extend };
  }
  if (event.key === 'End') {
    return { to: { row: from.row, col: lastIn(sheet, held, from.row) }, extend };
  }

  const step = stepping(event, sheet);
  if (step === null) return null;

  const to = jump
    ? edge(sheet, held, from, step)
    : { row: from.row + step.rows, col: from.col + step.cols };

  // Shift and tab together step *backwards* rather than reaching further: the
  // shift is what says which way, and a spreadsheet does not extend on it.
  return { to, extend: event.key === 'Tab' ? false : extend };
}

/** How far an ordinary movement key goes, before any of it is clamped. */
function stepping(event: KeyboardEvent, sheet: DrawnSheet): { rows: number; cols: number } | null {
  if (event.altKey) return null;
  const page = Math.max(1, sheet.rows - 1);

  switch (event.key) {
    case 'ArrowUp':
      return { rows: -1, cols: 0 };
    case 'ArrowDown':
      return { rows: 1, cols: 0 };
    case 'ArrowLeft':
      return { rows: 0, cols: -1 };
    case 'ArrowRight':
      return { rows: 0, cols: 1 };
    case 'Tab':
      return { rows: 0, cols: event.shiftKey ? -1 : 1 };
    case 'PageUp':
      return { rows: -page, cols: 0 };
    case 'PageDown':
      return { rows: page, cols: 0 };
    default:
      return null;
  }
}

/**
 * The edge of the block, which is what `Cmd`+arrow means in a spreadsheet.
 *
 * From a cell with something beside it, the far end of that run; from a cell
 * with nothing beside it, the next thing there is. Off the end of both, the
 * edge of the sheet — which is where a reader who holds the keys down expects
 * to arrive.
 *
 * Answered over the cells the host has *drawn*, since those are the ones the
 * view has. A window's worth is a long way in either direction, and moving into
 * the next one asks for it.
 */
function edge(
  sheet: DrawnSheet,
  held: ReadonlyMap<string, DrawnCell>,
  from: At,
  step: { rows: number; cols: number },
): At {
  const filled = (at: At): boolean => held.has(`${at.col}:${at.row}`);
  const next = (at: At): At => ({ row: at.row + step.rows, col: at.col + step.cols });
  const inside = (at: At): boolean =>
    at.row >= 1 && at.col >= 1 && at.row <= sheet.of.rows && at.col <= sheet.of.columns;

  let here = from;
  if (!inside(next(here))) return here;

  // Along a run of cells, or across a gap to the next one: whichever of the two
  // the reader is standing at the start of.
  const running = filled(next(here));
  while (inside(next(here)) && filled(next(here)) === running) here = next(here);

  return running ? here : inside(next(here)) ? next(here) : here;
}

/** The last column of this row that holds anything, or the first where none does. */
function lastIn(sheet: DrawnSheet, held: ReadonlyMap<string, DrawnCell>, row: number): number {
  let last = 1;
  for (let col = 1; col <= sheet.of.columns; col += 1) {
    if (held.has(`${col}:${row}`)) last = col;
  }
  return last;
}

/** Whether this is the key that takes the whole sheet. */
export function takingAll(event: KeyboardEvent): boolean {
  return event.key === 'a' && (event.metaKey || event.ctrlKey) && !event.altKey;
}

/** The rectangle two corners make, in the order a reader would read it. */
export function between(
  one: At,
  two: At,
): { top: number; left: number; bottom: number; right: number } {
  return {
    top: Math.min(one.row, two.row),
    left: Math.min(one.col, two.col),
    bottom: Math.max(one.row, two.row),
    right: Math.max(one.col, two.col),
  };
}

/** Whether a cell is inside the selected rectangle. */
export function within(at: At, one: At, two: At): boolean {
  const rect = between(one, two);
  return at.row >= rect.top && at.row <= rect.bottom && at.col >= rect.left && at.col <= rect.right;
}
