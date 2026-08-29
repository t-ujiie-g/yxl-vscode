import { cellKey, type Showing } from './showing';

/** What exists only while the reader is in it, in the order one takes the keyboard from another. */
const TAKES = ['.over button', '.tab.naming', '.asking'];

/** What stays open while the reader works elsewhere: it keeps the keyboard, and never takes it back. */
const KEEPS = ['.looking .for', '.looking .with'];

/** Where the panel held the keyboard before this: nowhere, on a cell, or in a box that stays open. */
export interface Held {
  readonly panel: boolean;
  readonly keeping: boolean;
}

/** What the panel holds the keyboard in now, for a redraw to put it back the same way. */
export function heldBy(into: HTMLElement): Held {
  const on = document.activeElement;

  return { panel: into.contains(on), keeping: found(into, KEEPS) === on };
}

/**
 * The one rule about where the keyboard is: the grid has it unless something
 * the reader opened has it. `had.panel` says whether the panel may have it at
 * all — taking it from the text editor beside is not the panel's to do.
 */
export function keyboard(into: HTMLElement, showing: Showing, had: Held): void {
  if (!had.panel) return;

  const taking = found(into, TAKES);
  if (taking !== null) {
    // A redraw while the reader is typing must not put the caret back to the
    // start of what they have written.
    if (taking === document.activeElement) return;

    taking.focus();
    if (taking instanceof HTMLInputElement || taking instanceof HTMLTextAreaElement) {
      taking.select();
    }
    return;
  }

  const keeping = found(into, KEEPS);
  if (had.keeping && keeping !== null) {
    keeping.focus();
    return;
  }

  focusCell(into, showing);
}

/** The keyboard on the cell the reader has selected, where there is one. */
export function focusCell(into: HTMLElement, showing: Showing): void {
  if (showing.selected === null) return;

  const at = cellKey(showing.selected.col, showing.selected.row);
  into.querySelector<HTMLElement>(`td[data-at="${at}"]`)?.focus({ preventScroll: true });
}

/** The first of these the panel holds, in the order they are written. */
function found(into: HTMLElement, these: readonly string[]): HTMLElement | null {
  for (const one of these) {
    const held = into.querySelector<HTMLElement>(one);
    if (held !== null) return held;
  }
  return null;
}
