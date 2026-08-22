import type { Axis, BorderStyle, StyleSays } from '@yxl-vscode/spec';
import type { Rect } from '@yxl-vscode/units';
import { type At, within } from './keys';
import type {
  Drawing,
  Editable,
  Grouped,
  Hidden,
  Pasted,
  PastedText,
  Ranged,
  Refused,
  Resized,
  Source,
  Typed,
  Worn,
} from './protocol';

/** What the view is showing: the drawing, and the little it holds of its own. */
export interface Showing {
  readonly drawing: Drawing;
  readonly sheet: number;
  readonly selected: At | null;
  /** The corner the selection was started from, where it reaches further than one cell. */
  readonly anchor: At | null;
  readonly sources: readonly Source[] | null;
  readonly reached: Reached | null;
  readonly refused: Refused | null;
  readonly said: string | null;
  readonly copied: Copied | null;
  readonly looking: Looking | null;

  /** The line a border button draws with, which is the toolbar's own setting. */
  readonly line: BorderStyle;

  /** Which of the toolbar's menus is open, by name; the view's own, like the line. */
  readonly menu: string | null;

  /** The heading a reader has asked for a menu on, and where they asked. */
  readonly pointed: Pointed | null;

  /** Whether the selected cell can be typed into, where one is selected. */
  readonly editable: Editable | null;
}

/**
 * What the reader is looking for, and where they are in what was found. `at` is
 * `-1` before they have gone to any of it.
 */
export interface Looking {
  readonly text: string;
  readonly cells: readonly At[];
  readonly at: number;
}

/** A rectangle the reader has copied, and whether putting it down takes it from where it is. */
export interface Copied {
  readonly sheet: string;
  readonly rect: Rect;
  readonly cut: boolean;
}

/** What the cursor in the text is reaching, and what to call it. */
export interface Reached {
  readonly says: string;
  readonly cells: ReadonlySet<string>;
}

/** Whether this cell is inside the rectangle the reader has selected. */
export function ranged(showing: Showing, at: At): boolean {
  const { selected, anchor } = showing;
  if (selected === null || anchor === null) return false;
  if (selected.row === anchor.row && selected.col === anchor.col) return false;

  return within(at, selected, anchor);
}

/** Whether this cell is one of those the search turned up. */
export function lookedUp(showing: Showing, at: At): boolean {
  return showing.looking?.cells.some((one) => one.row === at.row && one.col === at.col) === true;
}

/** Whether this cell is one of those the reader has copied, on the sheet they copied from. */
export function copiedFrom(showing: Showing, at: At): boolean {
  const { copied } = showing;
  if (copied === null || copied.sheet !== showing.drawing.sheets[showing.sheet]?.name) return false;

  return (
    at.row >= copied.rect.top &&
    at.row <= copied.rect.bottom &&
    at.col >= copied.rect.left &&
    at.col <= copied.rect.right
  );
}

/** A heading a menu was asked for on, and the point on the page it was asked at. */
export interface Pointed {
  readonly axis: Axis;
  readonly at: number;
  readonly x: number;
  readonly y: number;
}

/** How a cell is named in the sets and maps a drawing is looked up in. */
export function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

/** What the view can ask for. None of it changes anything (ADR-001). */
export interface Asks {
  readonly showSheet: (index: number) => void;
  readonly select: (row: number, col: number) => void;
  readonly reachTo: (row: number, col: number) => void;
  readonly reveal: (source: Source) => void;
  readonly setParam: (name: string, value: string) => void;
  readonly showWindow: (row: number, col: number) => void;
  readonly edit: (row: number, col: number, text: string) => void;
  readonly empty: (row: number, col: number) => void;
  readonly undo: (redo: boolean) => void;
  readonly copy: (row: number, col: number, cut: boolean) => void;
  readonly paste: (row: number, col: number) => void;
  readonly resolveWith: (typed: Typed, choice: string) => void;
  readonly emptiedWith: (ranged: Ranged, choice: string) => void;
  readonly wear: (want: StyleSays, over: Rect) => void;
  readonly drawWith: (line: BorderStyle) => void;
  readonly openMenu: (name: string | null) => void;
  readonly resize: (axis: Axis, at: number, size: number) => void;
  readonly takeBand: (axis: Axis, at: number, extend: boolean) => void;
  readonly takeAll: () => void;
  readonly fit: (axis: Axis, at: number) => void;
  readonly hide: (axis: Axis, first: number, last: number, hidden: boolean) => void;
  readonly hiddenWith: (hidden: Hidden, choice: string) => void;
  readonly group: (axis: Axis, first: number, last: number, level: number) => void;
  readonly groupedWith: (grouped: Grouped, choice: string) => void;
  readonly pointAt: (at: Pointed | null) => void;
  readonly freeze: (at: At | null) => void;
  readonly resizedWith: (resized: Resized, choice: string) => void;
  readonly wornWith: (worn: Worn, choice: string) => void;
  readonly pastedWith: (pasted: Pasted, choice: string) => void;
  readonly pastedTextWith: (text: PastedText, choice: string) => void;
  readonly look: (text: string) => void;
  readonly goOn: (by: number) => void;
  readonly goTo: (address: string) => void;
  readonly stopLooking: () => void;
  readonly overrideWith: (typed: Typed, reason: string) => void;
}

/** How wide the column of row numbers is, which is not a column of the sheet. */
export const GUTTER = 44;

/** How tall the row of column headings is, which is not a row of the sheet; a frozen row sits under it. */
export const HEADING = 24;

/** How much room one level of an outline takes, in the gutter outside the headings (ADR-045). */
export const OUTLINE = 18;
