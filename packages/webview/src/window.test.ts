import { describe, expect, it } from 'vitest';
import type { DrawnSheet } from './protocol';
import { across, columnAt, down, heightOf, rowAt, sizeOf, wanted, widthOf } from './window';

function sheet(of: Partial<DrawnSheet> = {}): DrawnSheet {
  return {
    name: 'Sales',
    rows: 200,
    columns: 50,
    at: { row: 1, col: 1 },
    of: { rows: 1000, columns: 200 },
    widths: [],
    heights: [],
    cells: [],
    merges: [],
    visibility: 'visible',
    tabColor: null,
    problems: [],
    freeze: null,
    ...of,
  };
}

describe('how big a sheet is on the page', () => {
  it('gives a row Excel default height and a column Excel default width', () => {
    expect(heightOf(sheet(), 1)).toBe(20);
    expect(widthOf(sheet(), 1)).toBeCloseTo(59.01, 2);
  });

  it('takes the size a run of rows or columns declares', () => {
    const sized = sheet({
      heights: [{ first: 2, last: 3, size: 30, hidden: false, group: null }],
      widths: [{ first: 2, last: 2, size: 10, hidden: false, group: null }],
    });

    expect([heightOf(sized, 2), heightOf(sized, 4)]).toEqual([40, 20]);
    expect([widthOf(sized, 2), widthOf(sized, 3)]).toEqual([70, widthOf(sheet(), 3)]);
  });

  it('puts a row and a column where the rows and columns before them end', () => {
    expect(down(sheet(), 11)).toBe(200);
    expect(
      across(sheet({ widths: [{ first: 1, last: 2, size: 10, hidden: false, group: null }] }), 3),
    ).toBe(140);
  });

  it('answers which row and column a scroll position has reached', () => {
    expect(rowAt(sheet(), 0)).toBe(1);
    expect(rowAt(sheet(), 200)).toBe(11);
    expect(columnAt(sheet(), 0)).toBe(1);
  });

  it('stops at the last row and column, however far the scroll went', () => {
    const small = sheet({ of: { rows: 3, columns: 2 } });
    expect([rowAt(small, 99_999), columnAt(small, 99_999)]).toEqual([3, 2]);
  });
});

describe('the window a scrolled view wants', () => {
  it('wants nothing while the drawn window still covers where the reader is', () => {
    const drawn = sheet({ at: { row: 400, col: 1 } });
    expect(wanted(drawn, { top: down(drawn, 500), left: 0 })).toBeNull();
  });

  it('wants a window around the reader on nearing the end of the drawn one', () => {
    const drawn = sheet({ at: { row: 400, col: 1 } });
    // Row 590 is inside what is drawn, but ten rows from the edge of it: asking
    // only once it has run out would leave the reader looking at nothing.
    expect(wanted(drawn, { top: down(drawn, 590), left: 0 })).toEqual({ row: 490, col: 1 });
  });

  it('wants nothing at the top of a sheet, where there is nothing above to draw', () => {
    // The centred window would start before row 1, so it is the window already
    // drawn — and asking for it again would be a redraw per scrolled row.
    expect(wanted(sheet(), { top: 0, left: 0 })).toBeNull();
  });

  it('wants nothing at the end of a sheet whose last window is drawn', () => {
    // The window that fits at the end is the last one there is. Asking to be
    // centred past it gets that same window back, and asking again for what has
    // already been answered is a loop with a redraw in it.
    const drawn = sheet({ at: { row: 801, col: 1 }, of: { rows: 1000, columns: 50 } });
    expect(wanted(drawn, { top: down(drawn, 1000), left: 0 })).toBeNull();
  });

  it('wants nothing in a sheet smaller than one window, wherever the reader is', () => {
    // Every row of it is within a margin of an edge, so the near test is always
    // true here — what stops the asking is that there is no other window.
    const small = sheet({ rows: 4, columns: 4, of: { rows: 4, columns: 4 } });

    expect(wanted(small, { top: 0, left: 0 })).toBeNull();
    expect(wanted(small, { top: down(small, 4), left: across(small, 4) })).toBeNull();
  });

  it('wants a window sideways as well, which a wide sheet scrolls', () => {
    const drawn = sheet({ at: { row: 1, col: 1 } });
    expect(wanted(drawn, { top: 0, left: across(drawn, 100) })).toEqual({ row: 1, col: 75 });
  });
});

describe('a dragged size in the units a spec writes it in', () => {
  it('is character units across, which is what a column band keeps', () => {
    expect(sizeOf('column', 70)).toBe(10);
    expect(sizeOf('column', 59)).toBe(8.43);
  });

  it('is points down, which is what a row band keeps', () => {
    expect(sizeOf('row', 20)).toBe(15);
    expect(sizeOf('row', 37.333)).toBe(28);
  });

  it('is rounded to what a person would write, not to what the pointer said', () => {
    expect(sizeOf('column', 71)).toBe(10.14);
  });

  it('stops where the grip it was dragged by would go with it', () => {
    expect(sizeOf('column', 0)).toBe(1);
    expect(sizeOf('row', 1)).toBe(6);
  });
});
