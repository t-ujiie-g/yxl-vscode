// @vitest-environment jsdom

import { within } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { sheet as drawnSheet } from './harness';
import {
  between,
  copying,
  edging,
  filling,
  going,
  looking,
  pasting,
  takingAll,
  undoing,
  wearing,
} from './keys';
import type { DrawnSheet } from './protocol';

/** A sheet with room to move about in, since these tests are about where a key takes the reader. */
const sheet = (of: Partial<DrawnSheet> = {}): DrawnSheet =>
  drawnSheet({ rows: 20, columns: 10, of: { rows: 20, columns: 10 }, ...of });

const key = (of: Partial<KeyboardEvent>): KeyboardEvent => new KeyboardEvent('keydown', of);

describe('where a key takes the reader', () => {
  it('says nothing about a key that is not a movement', () => {
    expect(going(key({ key: 'x' }), sheet(), { row: 1, col: 1 })).toBeNull();
  });

  it('moves one cell by an arrow, and a window by a page', () => {
    const down = going(key({ key: 'ArrowDown' }), sheet(), { row: 2, col: 2 });
    const page = going(key({ key: 'PageDown' }), sheet({ rows: 5 }), { row: 2, col: 2 });

    expect(down?.to).toEqual({ row: 3, col: 2 });
    expect(page?.to).toEqual({ row: 6, col: 2 });
  });

  it('reaches rather than moves while shift is held, except on tab', () => {
    const reach = going(key({ key: 'ArrowRight', shiftKey: true }), sheet(), {
      row: 1,
      col: 1,
    });
    const back = going(key({ key: 'Tab', shiftKey: true }), sheet(), { row: 1, col: 2 });

    expect(reach).toEqual({ to: { row: 1, col: 2 }, extend: true });
    expect(back).toEqual({ to: { row: 1, col: 1 }, extend: false });
  });

  it('answers nothing for a far end, which the sheet rather than the window knows', () => {
    // Where a block ends is past the end of the drawn window as often as not
    // (ADR-019), so `edging` names the end and the host answers with the cell.
    for (const far of [
      key({ key: 'ArrowDown', metaKey: true }),
      key({ key: 'End' }),
      key({ key: 'End', metaKey: true }),
    ]) {
      expect(going(far, sheet(), { row: 1, col: 1 })).toBe(null);
    }

    expect(edging(key({ key: 'ArrowDown', metaKey: true }))).toEqual({
      kind: 'block',
      rows: 1,
      cols: 0,
    });
    expect(edging(key({ key: 'ArrowLeft', metaKey: true }))).toEqual({
      kind: 'block',
      rows: 0,
      cols: -1,
    });
  });

  it('asks for the row on end, and for the sheet with cmd', () => {
    expect(edging(key({ key: 'End' }))).toEqual({ kind: 'row' });
    expect(edging(key({ key: 'End', metaKey: true }))).toEqual({ kind: 'sheet' });
  });

  it('is not a far end without the cmd, or with a key that does not move a cell', () => {
    expect(edging(key({ key: 'ArrowDown' }))).toBeNull();
    expect(edging(key({ key: 'PageDown', metaKey: true }))).toBeNull();
    expect(edging(key({ key: 'ArrowDown', metaKey: true, altKey: true }))).toBeNull();
    expect(edging(key({ key: 'End', altKey: true }))).toBeNull();
  });

  it('goes to the row on home, and to the first cell of the sheet with cmd', () => {
    const row = going(key({ key: 'Home' }), sheet(), { row: 4, col: 7 });
    const all = going(key({ key: 'Home', metaKey: true }), sheet(), { row: 4, col: 7 });

    expect([row?.to, all?.to]).toEqual([
      { row: 4, col: 1 },
      { row: 1, col: 1 },
    ]);
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
