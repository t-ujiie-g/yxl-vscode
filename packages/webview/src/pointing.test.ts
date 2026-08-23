// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { asks, cell, drawing, sheet, showingOf } from './harness';
import { pointing } from './pointing';
import type { Asks, Showing } from './showing';

/** The menu asked for on a cell, with the selection where the reader left it. */
function at(row: number, col: number, of: Partial<Showing> = {}) {
  const on = asks();
  const showing = showingOf({
    drawing: drawing({ sheets: [sheet({ cells: [cell(1, 1)] })] }),
    selected: { row, col },
    anchor: { row, col },
    pointed: { kind: 'cell', row, col, x: 8, y: 12 },
    ...of,
  });

  const menu = pointing(showing, on);
  if (menu === null) throw new Error('there is no menu');

  return { on, entries: [...menu.querySelectorAll<HTMLButtonElement>('.entry')] };
}

const said = (one: Element) => one.querySelector('.chord')?.textContent ?? null;

describe('the menu a cell has of its own', () => {
  it('holds the clipboard and clearing, each with the key that does it', () => {
    const { entries } = at(1, 1);

    expect(entries.map((one) => one.firstChild?.textContent)).toEqual([
      'Cut',
      'Copy',
      'Paste',
      'Clear contents',
    ]);
    expect(entries.map(said)).toEqual(['Ctrl+X', 'Ctrl+C', 'Ctrl+V', 'Delete']);
  });

  it('cuts and copies the cell it was asked for, and shuts itself', () => {
    const { on, entries } = at(2, 3);

    entries[0]?.click();
    expect(on.copy).toHaveBeenCalledWith(2, 3, true);
    expect(on.pointAt).toHaveBeenCalledWith(null);

    entries[1]?.click();
    expect(on.copy).toHaveBeenLastCalledWith(2, 3, false);
  });

  it('clears what the cells hold, which is the key beside it', () => {
    const { on, entries } = at(1, 1);

    entries[3]?.click();
    expect(on.empty).toHaveBeenCalledWith(1, 1);
  });
});

describe('paste, which the browser hands to the keyboard and not to a menu', () => {
  it('cannot be taken where nothing was copied inside the preview', () => {
    const { entries } = at(1, 1);
    const paste = entries[2];

    expect(paste?.disabled).toBe(true);
    expect(paste?.getAttribute('data-says')).toBe(
      'Press Ctrl+V: the clipboard is the keyboard’s to give',
    );
  });

  it('is taken where the preview has a rectangle of its own', () => {
    const copied = { sheet: 'Sales', rect: { top: 1, left: 1, bottom: 1, right: 1 }, cut: false };
    const { on, entries } = at(4, 2, { copied });

    expect(entries[2]?.disabled).toBe(false);
    entries[2]?.click();
    expect(on.paste).toHaveBeenCalledWith(4, 2);
  });
});

describe('what the menu is about', () => {
  it('is nothing at all where the reader has pointed at nothing', () => {
    expect(pointing(showingOf(), asks() as Asks)).toBeNull();
  });
});
