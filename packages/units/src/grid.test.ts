import { describe, expect, it } from 'vitest';
import { parseA1Addr, parseA1Range } from './a1';
import { parseColumnSpan, parseRowSpan } from './band';
import {
  addrAt,
  addressesOf,
  cellOf,
  columnsOf,
  overlapping,
  rangeOf,
  rectOf,
  rowsOf,
  within,
} from './grid';

function addr(text: string) {
  const read = parseA1Addr(text);
  if (read === null) throw new Error(`not an address: ${text}`);
  return read;
}

function range(text: string) {
  const read = parseA1Range(text);
  if (read === null) throw new Error(`not a range: ${text}`);
  return read;
}

describe('cellOf', () => {
  it('counts from one', () => {
    expect(cellOf(addr('A1'))).toEqual({ col: 1, row: 1 });
  });

  it('reads a two-letter column', () => {
    expect(cellOf(addr('AA10'))).toEqual({ col: 27, row: 10 });
    expect(cellOf(addr('XFD1048576'))).toEqual({ col: 16384, row: 1048576 });
  });

  it('reads a padded row as the row it names', () => {
    expect(cellOf(addr('A01'))).toEqual({ col: 1, row: 1 });
  });
});

describe('addrAt', () => {
  it('is the inverse of cellOf', () => {
    for (const text of ['A1', 'B2', 'Z9', 'AA10', 'AZ100', 'BA1', 'XFD1048576']) {
      expect(addrAt(cellOf(addr(text)))).toBe(text);
    }
  });

  it('carries the base-26 borrow, where Z is not a zero digit', () => {
    expect(addrAt({ col: 26, row: 1 })).toBe('Z1');
    expect(addrAt({ col: 27, row: 1 })).toBe('AA1');
    expect(addrAt({ col: 52, row: 1 })).toBe('AZ1');
    expect(addrAt({ col: 53, row: 1 })).toBe('BA1');
  });
});

describe('rectOf', () => {
  it('reads a range in reading order', () => {
    expect(rectOf(range('B2:D5'))).toEqual({ top: 2, left: 2, bottom: 5, right: 4 });
  });

  it('puts corners given the other way round in reading order too', () => {
    expect(rectOf(range('D5:B2'))).toEqual(rectOf(range('B2:D5')));
  });

  it('reads a range of one cell', () => {
    expect(rectOf(range('C3:C3'))).toEqual({ top: 3, left: 3, bottom: 3, right: 3 });
  });
});

describe('rangeOf', () => {
  it('spells a rectangle as a range, and is the way back from rectOf', () => {
    const rect = { top: 2, left: 1, bottom: 4, right: 3 };

    expect(rangeOf(rect)).toBe('A2:C4');
    expect(rectOf(rangeOf(rect))).toEqual(rect);
  });

  it('spells one cell as a range of one', () => {
    expect(rangeOf({ top: 1, left: 1, bottom: 1, right: 1 })).toBe('A1:A1');
  });
});

describe('addressesOf', () => {
  it('walks a rectangle row by row, as a reader reads it', () => {
    expect(addressesOf({ top: 1, left: 1, bottom: 2, right: 2 })).toEqual(['A1', 'B1', 'A2', 'B2']);
  });
});

describe('overlapping', () => {
  const one = { top: 1, left: 1, bottom: 2, right: 2 };

  it('is true where two rectangles share a cell, and false where they only touch', () => {
    expect(overlapping(one, { top: 2, left: 2, bottom: 3, right: 3 })).toBe(true);
    expect(overlapping(one, { top: 3, left: 1, bottom: 3, right: 2 })).toBe(false);
    expect(overlapping(one, { top: 1, left: 3, bottom: 2, right: 3 })).toBe(false);
  });
});

describe('columnsOf and rowsOf', () => {
  it('read one column or row as a band of one', () => {
    expect(columnsOf(span('B'))).toEqual({ first: 2, last: 2 });
    expect(rowsOf(rows('1'))).toEqual({ first: 1, last: 1 });
  });

  it('read a range of them', () => {
    expect(columnsOf(span('D-F'))).toEqual({ first: 4, last: 6 });
    expect(rowsOf(rows('2-4'))).toEqual({ first: 2, last: 4 });
  });
});

describe('within', () => {
  it('includes the edges', () => {
    const rect = rectOf(range('B2:D5'));
    expect(within({ col: 2, row: 2 }, rect)).toBe(true);
    expect(within({ col: 4, row: 5 }, rect)).toBe(true);
  });

  it('excludes what is outside on any side', () => {
    const rect = rectOf(range('B2:D5'));
    for (const cell of [
      { col: 1, row: 3 },
      { col: 5, row: 3 },
      { col: 3, row: 1 },
      { col: 3, row: 6 },
    ]) {
      expect(within(cell, rect)).toBe(false);
    }
  });
});

function span(text: string) {
  const read = parseColumnSpan(text);
  if (read === null) throw new Error(`not a column span: ${text}`);
  return read;
}

function rows(text: string) {
  const read = parseRowSpan(text);
  if (read === null) throw new Error(`not a row span: ${text}`);
  return read;
}
