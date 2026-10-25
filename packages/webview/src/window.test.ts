import { describe, expect, it } from 'vitest';
import { sheet as drawnSheet } from './harness';
import type { DrawnSheet } from './protocol';
import { across, around, down, grow, heightOf, landing, sizeOf, wanted, widthOf } from './window';

/** A sheet far larger than its window, which is what a scroll is measured against. */
function sheet(of: Partial<DrawnSheet> = {}): DrawnSheet {
  return drawnSheet({ rows: 200, columns: 50, of: { rows: 1000, columns: 200 }, ...of });
}

describe('how big a sheet is on the page', () => {
  it('gives a row Excel default height and a column Excel default width', () => {
    // Excel's own numbers: 8.43 characters of seven pixels, and the five a cell
    // keeps around them, is the 64px column every workbook opens with.
    expect(heightOf(sheet(), 1)).toBe(20);
    expect(widthOf(sheet(), 1)).toBeCloseTo(64.01, 2);
  });

  it('takes the size a run of rows or columns declares', () => {
    const sized = sheet({
      heights: [{ first: 2, last: 3, size: 30, hidden: false, group: null }],
      widths: [{ first: 2, last: 2, size: 10, hidden: false, group: null }],
    });

    expect([heightOf(sized, 2), heightOf(sized, 4)]).toEqual([40, 20]);
    expect([widthOf(sized, 2), widthOf(sized, 3)]).toEqual([75, widthOf(sheet(), 3)]);
  });

  it('puts a row and a column where the rows and columns before them end', () => {
    expect(down(sheet(), 11)).toBe(200);
    expect(
      across(sheet({ widths: [{ first: 1, last: 2, size: 10, hidden: false, group: null }] }), 3),
    ).toBe(150);
  });
});

describe('a row fitted to what it holds', () => {
  it('is as tall as it was measured, and every row below it moves down by as much', () => {
    const fitted = sheet();
    grow(fitted, new Map([[3, 61]]));

    expect([heightOf(fitted, 3), down(fitted, 4), down(fitted, 11)]).toEqual([61, 101, 241]);
  });

  it('keeps Excel default height where it was measured shorter than that', () => {
    const fitted = sheet();
    grow(fitted, new Map([[3, 12]]));

    expect(heightOf(fitted, 3)).toBe(20);
  });

  it('keeps the height a row declares, and a hidden row stays hidden', () => {
    const fitted = sheet({
      heights: [
        { first: 2, last: 2, size: 30, hidden: false, group: null },
        { first: 3, last: 3, size: null, hidden: true, group: null },
      ],
    });
    grow(
      fitted,
      new Map([
        [2, 99],
        [3, 99],
      ]),
    );

    expect([heightOf(fitted, 2), heightOf(fitted, 3)]).toEqual([40, 0]);
  });

  it('is where a point down the sheet lands, as tall as it was drawn', () => {
    const fitted = sheet();
    grow(fitted, new Map([[1, 100]]));

    expect(landing(fitted, { top: 99, left: 0 }).row).toBe(1);
    expect(landing(fitted, { top: 100, left: 0 }).row).toBe(2);
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
  it('leaves the rows alone while scrolling sideways near the top, and the columns going down', () => {
    // Near one edge is not near the other: at row 1 every column scrolled used
    // to ask for the same rows again, and every row at column A the same columns.
    const drawn = sheet({ at: { row: 1, col: 1 } });

    expect(wanted(drawn, { top: down(drawn, 30), left: 0 })).toBeNull();
    expect(wanted(drawn, { top: 0, left: across(drawn, 20) })).toBeNull();
  });

  it('wants a window once the bottom of what the reader sees nears the end of the drawn one', () => {
    const drawn = sheet({ at: { row: 1, col: 1 } });
    const seen = { height: 50 * 20, width: 0 };

    expect(wanted(drawn, { top: down(drawn, 120), left: 0 }, seen)).toBeNull();
    expect(wanted(drawn, { top: down(drawn, 140), left: 0 }, seen)).toEqual({ row: 65, col: 1 });
  });
});

describe('the window around a cell', () => {
  it('has the cell at its middle', () => {
    expect(around(sheet(), { row: 500, col: 100 })).toEqual({ row: 400, col: 75 });
  });

  it('stays inside the sheet at either end', () => {
    expect(around(sheet(), { row: 3, col: 3 })).toEqual({ row: 1, col: 1 });
    expect(around(sheet(), { row: 1000, col: 200 })).toEqual({ row: 801, col: 151 });
  });
});

describe('a dragged size in the units a spec writes it in', () => {
  it('is character units across, which is what a column band keeps', () => {
    // The five pixels a cell keeps around its text come off first, so a drag
    // and the width it writes are Excel's own round trip: 8.43 draws as 64.
    expect(sizeOf('column', 75)).toBe(10);
    expect(sizeOf('column', 64)).toBe(8.43);
  });

  it('is points down, which is what a row band keeps', () => {
    expect(sizeOf('row', 20)).toBe(15);
    expect(sizeOf('row', 37.333)).toBe(28);
  });

  it('is rounded to what a person would write, not to what the pointer said', () => {
    expect(sizeOf('column', 76)).toBe(10.14);
  });

  it('stops where the grip it was dragged by would go with it', () => {
    expect(sizeOf('column', 0)).toBe(1);
    expect(sizeOf('row', 1)).toBe(6);
  });
});
