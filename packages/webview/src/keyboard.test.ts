// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { draw, restate } from './draw';
import { asks, at, showingOf, shown } from './harness';
import type { Refused } from './protocol';
import type { Showing } from './showing';

const REFUSED: Refused = {
  kind: 'refused',
  why: 'B5 is filled by a range',
  about: { kind: 'edit', sheet: 'Sales', row: 5, col: 2, text: '=B1*2' },
  canOverride: true,
  choices: [{ id: 'rangeFormula', what: "Change the range's formula", moves: 2, sample: [] }],
};

const SELECTED: Partial<Showing> = { selected: { row: 1, col: 1 } };

/** The panel in the page with the keyboard on its selected cell, which is where a reader leaves it. */
function panel(of: Partial<Showing> = SELECTED): HTMLElement {
  const into = shown(of);
  at(into, 1, 1)?.focus();
  return into;
}

describe('where the keyboard is', () => {
  it('is the selected cell, where the panel had it and nothing is open', () => {
    const into = panel();
    draw(into, showingOf(SELECTED), asks());

    expect(document.activeElement).toBe(at(into, 1, 1));
  });

  it('is wherever it was, where the panel did not have it', () => {
    // The reader is typing in the YAML beside: every keystroke redraws the
    // preview, and none of them is theirs to be taken away from.
    const outside = document.createElement('input');
    document.body.append(outside);
    const into = shown(SELECTED);
    outside.focus();

    draw(into, showingOf(SELECTED), asks());

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('is the question, from the moment it is asked', () => {
    const into = panel();
    restate(into, showingOf({ ...SELECTED, refused: REFUSED }), asks());

    expect(document.activeElement).toBe(into.querySelector('.refused .choice'));
  });

  it('is back on the cell when the question goes, which is what answers the next key', () => {
    const into = panel();
    restate(into, showingOf({ ...SELECTED, refused: REFUSED }), asks());
    restate(into, showingOf(SELECTED), asks());

    expect(document.activeElement).toBe(at(into, 1, 1));
  });

  it('stays in the box the reader is typing in, across a redraw that rebuilds it', () => {
    // The find bar is open and being typed in: a redraw that put the keyboard
    // back on the cell would take the search out from under them.
    const looking = { ...SELECTED, looking: { text: 'ab', cells: [], at: -1, becomes: '' } };
    const into = panel(looking);
    into.querySelector<HTMLInputElement>('.looking .for')?.focus();

    draw(into, showingOf(looking), asks());

    expect(document.activeElement).toBe(into.querySelector('.looking .for'));
  });

  it('goes back to the cell when the reader left that box for the grid', () => {
    // A bar that stays open is not a bar that keeps taking the keyboard: the
    // reader is in the grid, and the next key is the grid's.
    const looking = { ...SELECTED, looking: { text: 'ab', cells: [], at: -1, becomes: '' } };
    const into = panel(looking);

    draw(into, showingOf(looking), asks());

    expect(document.activeElement).toBe(at(into, 1, 1));
  });

  it('is the box a cell was typed into, which exists only while the reader is in it', () => {
    const into = panel();
    draw(
      into,
      showingOf({ ...SELECTED, asking: { what: 'note', at: { row: 1, col: 1 } } }),
      asks(),
    );

    expect(document.activeElement).toBe(into.querySelector('.asking'));
  });
});
