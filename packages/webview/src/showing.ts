import type { StyleSays } from '@yxl-vscode/spec';
import type { Rect } from '@yxl-vscode/units';
import type { At } from './keys';
import type {
  Drawing,
  Editable,
  Pasted,
  PastedText,
  Ranged,
  Refused,
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
