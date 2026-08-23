import type { Rect } from '@yxl-vscode/units';
import type { DrawnCell, DrawnSheet } from './protocol';

/** A cell of the grid, as the view points at one. */
export interface At {
  readonly row: number;
  readonly col: number;
}

/** Where a key would take the selection, and whether it takes the range with it. */
interface Going {
  readonly to: At;
  readonly extend: boolean;
}

/**
 * Where a key moves the reader, or `null`: arrows, tab, page, `Cmd`+arrow to
 * the edge of a block, `Home` and `End`. `Shift` takes the selection with it.
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

  // Shift+Tab steps back rather than reaching, as in every spreadsheet.
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

/** The edge of the block: the far end of a run, across a gap to the next thing, or the sheet's own edge. */
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

/** Whether this is the key that takes an edit back, or with `Shift` puts it again. */
export function undoing(event: KeyboardEvent): boolean {
  return (event.key === 'z' || event.key === 'Z') && (event.metaKey || event.ctrlKey);
}

/** Whether this is the key that copies the selection, and whether it takes the cells with it. */
export function copying(event: KeyboardEvent): 'copy' | 'cut' | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  if (event.key === 'c' || event.key === 'C') return 'copy';

  return event.key === 'x' || event.key === 'X' ? 'cut' : null;
}

/** Whether this is the key that puts a copied rectangle down. */
export function pasting(event: KeyboardEvent): boolean {
  return (event.key === 'v' || event.key === 'V') && (event.metaKey || event.ctrlKey);
}

/** Whether this is the key that opens the search, or the one that goes on through it. */
export function looking(event: KeyboardEvent): 'open' | 'on' | 'back' | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  if (event.key === 'f' || event.key === 'F') return 'open';
  if (event.key !== 'g' && event.key !== 'G') return null;

  return event.shiftKey ? 'back' : 'on';
}

/** How a shortcut is written on the reader's own keyboard. */
export const HELD = navigator.userAgent.includes('Mac') ? '\u2318' : 'Ctrl+';

/** The look a shortcut asks for: `Cmd`/`Ctrl`+`B`, `I` and `U`, as both spreadsheets have them. */
export function wearing(event: KeyboardEvent): 'bold' | 'italic' | 'underline' | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return null;

  switch (event.key) {
    case 'b':
    case 'B':
      return 'bold';
    case 'i':
    case 'I':
      return 'italic';
    case 'u':
    case 'U':
      return 'underline';
    default:
      return null;
  }
}

/** Whether this is the key that takes the whole sheet. */
export function takingAll(event: KeyboardEvent): boolean {
  return event.key === 'a' && (event.metaKey || event.ctrlKey) && !event.altKey;
}

/** The rectangle two corners make, in the order a reader would read it. */
export function between(one: At, two: At): Rect {
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
