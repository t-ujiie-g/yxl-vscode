import type { Axis, BorderStyle, StyleSays, StyleValues } from '@yxl-vscode/spec';
import type { Rect } from '@yxl-vscode/units';
import { type At, between, within } from './keys';
import type {
  About,
  Drawing,
  DrawnCell,
  Editable,
  Refused,
  Source,
  Summed,
  Typed,
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

  /** What the rectangle selected comes to, where more than one cell is (ADR-014). */
  readonly comes: Summed | null;

  /** Whether the selected cell can be typed into, where one is selected. */
  readonly editable: Editable | null;

  /** The sheet whose tab is being renamed, by its place in the tab bar. */
  readonly naming: number | null;
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

/** Whether the selection reaches this cell, a lone selected cell included. */
export function reaches(showing: Showing, at: At): boolean {
  const { selected, anchor } = showing;
  return selected !== null && within(at, selected, anchor ?? selected);
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
export type Pointed = PointedHeading | PointedCell | PointedTab;

/** A menu asked for on a column letter or a row number. */
export interface PointedHeading {
  readonly kind: 'heading';
  readonly axis: Axis;
  readonly at: number;
  readonly x: number;
  readonly y: number;
}

/** A menu asked for on a sheet's tab. */
export interface PointedTab {
  readonly kind: 'tab';
  readonly sheet: number;
  readonly x: number;
  readonly y: number;
}

/** A menu asked for on a cell of the grid. */
export interface PointedCell {
  readonly kind: 'cell';
  readonly row: number;
  readonly col: number;
  readonly x: number;
  readonly y: number;
}

/** The rectangle a control acts on, which is everything the reader has selected. */
export function over(showing: Showing): Rect {
  const at = showing.selected ?? { row: 1, col: 1 };
  return between(at, showing.anchor ?? at);
}

/** What the cell the reader has selected wears, which is what the toolbar shows. */
export function wornBy(showing: Showing): StyleValues {
  return cellOf(showing)?.style ?? {};
}

/** The cell the reader has selected, where the drawing holds one. */
export function cellOf(showing: Showing): DrawnCell | undefined {
  const at = showing.selected;
  if (at === null) return undefined;

  const cells = showing.drawing.sheets[showing.sheet]?.cells ?? [];
  return cells.find((one: DrawnCell) => one.row === at.row && one.col === at.col);
}

/** How a cell is named in the sets and maps a drawing is looked up in. */
export function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

/** What the view can ask for. None of it changes anything (ADR-001). */
export interface Asks {
  readonly showSheet: (index: number) => void;
  readonly addSheet: (name: string) => void;
  readonly renameSheet: (sheet: string, name: string) => void;
  readonly nameSheet: (index: number | null) => void;
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
  readonly wear: (want: StyleSays, over: Rect) => void;
  readonly drawWith: (line: BorderStyle) => void;
  readonly openMenu: (name: string | null) => void;
  readonly resize: (axis: Axis, at: number, size: number) => void;
  readonly takeBand: (axis: Axis, at: number, extend: boolean) => void;
  readonly takeAll: () => void;
  readonly fit: (axis: Axis, at: number) => void;
  readonly hide: (axis: Axis, first: number, last: number, hidden: boolean) => void;
  readonly group: (axis: Axis, first: number, last: number, level: number) => void;
  readonly line: (axis: Axis, at: number, by: number) => void;
  readonly merge: (merged: boolean) => void;
  readonly table: () => void;
  readonly fill: (axis: Axis) => void;
  readonly sort: (down: boolean) => void;
  readonly pointAt: (at: Pointed | null) => void;
  readonly freeze: (at: At | null) => void;
  readonly look: (text: string | null) => void;
  readonly goOn: (by: number) => void;
  readonly goTo: (address: string) => void;
  readonly stopLooking: () => void;
  readonly answer: (asked: About, choice: string) => void;
  readonly overrideWith: (typed: Typed, reason: string) => void;
}

/** How wide the column of row numbers is, which is not a column of the sheet. */
export const GUTTER = 44;

/** How tall the row of column headings is, which is not a row of the sheet; a frozen row sits under it. */
export const HEADING = 24;

/** How much room one level of an outline takes, in the gutter outside the headings (ADR-045). */
export const OUTLINE = 18;
