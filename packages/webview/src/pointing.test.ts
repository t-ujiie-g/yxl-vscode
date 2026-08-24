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
      'Insert note',
      'Link to a page…',
      'Link to a cell…',
      'Data validation…',
      'Format as table',
      'Create a filter',
    ]);
    expect(entries.map(said)).toEqual([
      'Ctrl+X',
      'Ctrl+C',
      'Ctrl+V',
      'Delete',
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
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

describe('the filter a sheet may hang off its header row', () => {
  it('offers to create one where the sheet has none, over the selection header', () => {
    const { on, entries } = at(1, 1);

    entries[9]?.click();
    expect(on.filter).toHaveBeenCalledWith(true);
  });
});

describe('the table a region may be made', () => {
  it('offers to make one over the selection where the cell is in none', () => {
    const { on, entries } = at(1, 1);

    entries[8]?.click();
    expect(on.formatTable).toHaveBeenCalledWith(true);
  });

  it('offers to take off the one the cell is in instead', () => {
    const table = {
      top: 1,
      left: 1,
      bottom: 2,
      right: 2,
      name: 'Table1',
      style: null,
      bandedRows: true,
      bandedColumns: false,
      firstColumn: false,
      lastColumn: false,
    };
    const held = drawing({ sheets: [sheet({ cells: [cell(1, 1)], tables: [table] })] });
    const { on, entries } = at(1, 1, { drawing: held });
    const taken = entries.find((one) => one.firstChild?.textContent === 'Remove table');

    taken?.click();
    expect(on.formatTable).toHaveBeenCalledWith(false);
  });
});

describe('the note a cell may carry', () => {
  it('offers to write one where the cell has none, at the cell pointed at', () => {
    const { on, entries } = at(2, 3);

    entries[4]?.click();
    expect(on.askAt).toHaveBeenCalledWith({ at: { row: 2, col: 3 }, what: 'note' });
  });

  it('offers to change and to take off the one a cell carries', () => {
    const noted = cell(1, 1, { note: { text: 'check stock', author: null } });
    const { on, entries } = at(1, 1, {
      drawing: drawing({ sheets: [sheet({ cells: [noted] })] }),
    });

    expect(entries.map((one) => one.firstChild?.textContent)).toContain('Edit note');
    entries[5]?.click();
    expect(on.note).toHaveBeenCalledWith(1, 1, null);
  });
});

describe('the validation a range may take', () => {
  it('asks for the choices where the cell is under none', () => {
    const { on, entries } = at(2, 3);

    entries[7]?.click();
    expect(on.askAt).toHaveBeenCalledWith({ at: { row: 2, col: 3 }, what: 'list' });
  });

  it('offers to take off the one a cell is under', () => {
    const under = cell(1, 1, { validation: { choices: ['Draft'], says: '' } });
    const { on, entries } = at(1, 1, {
      drawing: drawing({ sheets: [sheet({ cells: [under] })] }),
    });

    expect(entries.map((one) => one.firstChild?.textContent)).toContain('Remove validation');
    entries[7]?.click();
    expect(on.validate).toHaveBeenCalledWith(null);
  });
});

describe('the link a cell may carry', () => {
  it('asks which kind of target it is rather than reading it off the text', () => {
    const { on, entries } = at(2, 3);

    entries[5]?.click();
    expect(on.askAt).toHaveBeenCalledWith({ at: { row: 2, col: 3 }, what: 'url' });

    entries[6]?.click();
    expect(on.askAt).toHaveBeenLastCalledWith({ at: { row: 2, col: 3 }, what: 'to' });
  });

  it('offers to change the one a cell carries, in the kind it was written with', () => {
    const linked = cell(1, 1, { link: { kind: 'to', target: 'Notes!A1', tip: null } });
    const { on, entries } = at(1, 1, {
      drawing: drawing({ sheets: [sheet({ cells: [linked] })] }),
    });

    expect(entries.map((one) => one.firstChild?.textContent)).toContain('Edit link');
    entries[5]?.click();
    expect(on.askAt).toHaveBeenCalledWith({ at: { row: 1, col: 1 }, what: 'to' });

    entries[6]?.click();
    expect(on.link).toHaveBeenCalledWith(1, 1, null);
  });
});
