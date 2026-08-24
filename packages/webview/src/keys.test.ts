// @vitest-environment jsdom

import { within } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import {
  between,
  copying,
  filling,
  going,
  looking,
  pasting,
  takingAll,
  undoing,
  wearing,
} from './keys';
import type { DrawnCell, DrawnSheet } from './protocol';

const sheet = (of: Partial<DrawnSheet> = {}): DrawnSheet => ({
  name: 'Sales',
  rows: 20,
  columns: 10,
  at: { row: 1, col: 1 },
  of: { rows: 20, columns: 10 },
  widths: [],
  heights: [],
  cells: [],
  merges: [],
  problems: [],
  freeze: null,
  visibility: 'visible',
  tabColor: null,
  gridlines: true,
  split: null,
  filter: null,
  tables: [],
  ...of,
});

/** The cells a sheet holds, as the grid maps them: a block, then a gap, then one. */
function held(...at: string[]): ReadonlyMap<string, DrawnCell> {
  const cell = {} as DrawnCell;
  return new Map(at.map((one) => [one, cell]));
}

const key = (of: Partial<KeyboardEvent>): KeyboardEvent => new KeyboardEvent('keydown', of);

describe('where a key takes the reader', () => {
  it('says nothing about a key that is not a movement', () => {
    expect(going(key({ key: 'x' }), sheet(), held(), { row: 1, col: 1 })).toBeNull();
  });

  it('moves one cell by an arrow, and a window by a page', () => {
    const down = going(key({ key: 'ArrowDown' }), sheet(), held(), { row: 2, col: 2 });
    const page = going(key({ key: 'PageDown' }), sheet({ rows: 5 }), held(), { row: 2, col: 2 });

    expect(down?.to).toEqual({ row: 3, col: 2 });
    expect(page?.to).toEqual({ row: 6, col: 2 });
  });

  it('reaches rather than moves while shift is held, except on tab', () => {
    const reach = going(key({ key: 'ArrowRight', shiftKey: true }), sheet(), held(), {
      row: 1,
      col: 1,
    });
    const back = going(key({ key: 'Tab', shiftKey: true }), sheet(), held(), { row: 1, col: 2 });

    expect(reach).toEqual({ to: { row: 1, col: 2 }, extend: true });
    expect(back).toEqual({ to: { row: 1, col: 1 }, extend: false });
  });

  it('runs to the end of a block of cells on cmd-arrow', () => {
    // A1..A3 hold something, A4 does not: from A1 the run ends at A3.
    const cells = held('1:1', '1:2', '1:3');
    const to = going(key({ key: 'ArrowDown', metaKey: true }), sheet(), cells, { row: 1, col: 1 });

    expect(to?.to).toEqual({ row: 3, col: 1 });
  });

  it('crosses the gap to the next block, where it starts beside nothing', () => {
    const cells = held('1:1', '1:5', '1:6');
    const to = going(key({ key: 'ArrowDown', metaKey: true }), sheet(), cells, { row: 1, col: 1 });

    expect(to?.to).toEqual({ row: 5, col: 1 });
  });

  it('stops at the edge of the sheet where there is nothing to run to', () => {
    const to = going(key({ key: 'ArrowUp', metaKey: true }), sheet(), held(), { row: 1, col: 1 });
    expect(to?.to).toEqual({ row: 1, col: 1 });
  });

  it('goes to the row on home, and to the first cell of the sheet with cmd', () => {
    const row = going(key({ key: 'Home' }), sheet(), held(), { row: 4, col: 7 });
    const all = going(key({ key: 'Home', metaKey: true }), sheet(), held(), { row: 4, col: 7 });

    expect([row?.to, all?.to]).toEqual([
      { row: 4, col: 1 },
      { row: 1, col: 1 },
    ]);
  });

  it('goes to the last cell of the row on end', () => {
    const cells = held('1:4', '2:4', '5:4');
    expect(going(key({ key: 'End' }), sheet(), cells, { row: 4, col: 1 })?.to).toEqual({
      row: 4,
      col: 5,
    });
  });
});

describe('the rectangle two corners make', () => {
  it('reads the same whichever corner was put down first', () => {
    const one = between({ row: 4, col: 2 }, { row: 2, col: 5 });
    expect(one).toEqual({ top: 2, left: 2, bottom: 4, right: 5 });
  });

  it('holds the cells between them, and no others', () => {
    const corners = [
      { row: 2, col: 2 },
      { row: 4, col: 3 },
    ] as const;

    expect(within({ row: 3, col: 3 }, between(...corners))).toBe(true);
    expect(within({ row: 3, col: 4 }, between(...corners))).toBe(false);
  });
});

describe('the key that takes everything', () => {
  it('is cmd-A, and not A with anything else on it', () => {
    expect(takingAll(key({ key: 'a', metaKey: true }))).toBe(true);
    expect(takingAll(key({ key: 'a', ctrlKey: true }))).toBe(true);
    expect(takingAll(key({ key: 'a' }))).toBe(false);
    expect(takingAll(key({ key: 'a', metaKey: true, altKey: true }))).toBe(false);
  });
});

/** A key as the grid receives one, with only the modifiers named held down. */
const pressed = (key: string, held: Partial<KeyboardEventInit> = {}): KeyboardEvent =>
  new KeyboardEvent('keydown', { key, ...held });

describe('the keys a gesture is asked for by', () => {
  it('takes an edit back on cmd-Z, and puts it on again with shift', () => {
    expect(undoing(pressed('z', { metaKey: true }))).toBe(true);
    expect(undoing(pressed('Z', { ctrlKey: true, shiftKey: true }))).toBe(true);
    expect(undoing(pressed('z'))).toBe(false);
  });

  it('copies on cmd-C and cuts on cmd-X, and says which', () => {
    expect(copying(pressed('c', { metaKey: true }))).toBe('copy');
    expect(copying(pressed('X', { ctrlKey: true }))).toBe('cut');
    expect(copying(pressed('v', { metaKey: true }))).toBeNull();
    expect(copying(pressed('c'))).toBeNull();
  });

  it('leaves cmd-alt-C alone, which is a shortcut of somebody else’s', () => {
    expect(copying(pressed('c', { metaKey: true, altKey: true }))).toBeNull();
  });

  it('pastes on cmd-V and nothing else', () => {
    expect(pasting(pressed('v', { metaKey: true }))).toBe(true);
    expect(pasting(pressed('V', { ctrlKey: true }))).toBe(true);
    expect(pasting(pressed('v'))).toBe(false);
    expect(pasting(pressed('c', { metaKey: true }))).toBe(false);
  });

  it('puts a look on with cmd-B, cmd-I and cmd-U, in either case', () => {
    expect(wearing(pressed('b', { metaKey: true }))).toBe('bold');
    expect(wearing(pressed('I', { ctrlKey: true }))).toBe('italic');
    expect(wearing(pressed('u', { metaKey: true }))).toBe('underline');
    expect(wearing(pressed('b'))).toBeNull();
    expect(wearing(pressed('s', { metaKey: true }))).toBeNull();
  });

  it('leaves the shifted and alted ones alone, which belong to somebody else', () => {
    expect(wearing(pressed('b', { metaKey: true, shiftKey: true }))).toBeNull();
    expect(wearing(pressed('i', { ctrlKey: true, altKey: true }))).toBeNull();
  });

  it('fills down on cmd-D and right on cmd-R', () => {
    expect(filling(pressed('d', { metaKey: true }))).toBe('row');
    expect(filling(pressed('R', { ctrlKey: true }))).toBe('column');
    expect(filling(pressed('d'))).toBeNull();
    expect(filling(pressed('d', { metaKey: true, shiftKey: true }))).toBeNull();
  });

  it('opens the search on cmd-F, and goes through it on cmd-G', () => {
    expect(looking(pressed('f', { metaKey: true }))).toBe('open');
    expect(looking(pressed('g', { metaKey: true }))).toBe('on');
    expect(looking(pressed('G', { metaKey: true, shiftKey: true }))).toBe('back');
    expect(looking(pressed('g'))).toBeNull();
    expect(looking(pressed('h', { metaKey: true }))).toBeNull();
  });
});
