import type { Rect, SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { files, tried } from './harness';
import { tableOver } from './region';

/** The table set, through the checker — the file, or why not. */
function tabled(source: string, rect: Rect, on: boolean): string {
  const { doc, grid, read } = files(source);
  const intent = tableOver({ doc, grid }, { sheet: 'S' as SheetName, rect, on }, read);
  return tried(source, intent);
}

const SHEET =
  'sheets:\n  - name: S\n    cells:\n      A1: Region\n      B1: Revenue\n      A2: APAC\n      B2: 2400000\n';
const OVER = { top: 1, left: 1, bottom: 2, right: 2 };

describe('a region made a table', () => {
  it('is written under the sheet, with the `tables` key where there is none', () => {
    expect(tabled(SHEET, OVER, true)).toBe(
      `${SHEET}    tables:\n      - at: A1:B2\n        name: Table1\n`,
    );
  });

  it('goes in after the tables the sheet has, taking the next free name', () => {
    const already = `${SHEET}    tables:\n      - at: D1:E4\n        name: Table1\n`;
    expect(tabled(already, { top: 1, left: 1, bottom: 2, right: 1 }, true)).toBe(
      `${already}      - at: A1:A2\n        name: Table2\n`,
    );
  });

  it('is taken off by its entry going, and the key goes with the last of them', () => {
    const one = `${SHEET}    tables:\n      - at: A1:B2\n        name: Table1\n`;
    expect(tabled(one, OVER, false)).toBe(SHEET);
  });

  it('takes off only the tables the range touches', () => {
    const two = `${SHEET}    tables:\n      - at: A1:B2\n        name: Table1\n      - at: D1:E4\n        name: Table2\n`;
    expect(tabled(two, OVER, false)).toBe(
      `${SHEET}    tables:\n      - at: D1:E4\n        name: Table2\n`,
    );
  });

  it('is not stopped by an entry whose `at` a parameter fills in, which covers nothing here', () => {
    const templated = `params:\n  where: A1:B2\n${SHEET}    tables:\n      - at: "\${where}"\n        name: Table1\n`;
    expect(tabled(templated, OVER, true)).toBe(
      `${templated}      - at: A1:B2\n        name: Table2\n`,
    );
  });

  it('says so where there is no table here to take off', () => {
    expect(tabled(SHEET, OVER, false)).toBe('refused: nothing here is part of a table');
  });
});

describe('a region a table is refused over', () => {
  it('refuses one row, which is a header with nothing under it', () => {
    expect(tabled(SHEET, { top: 1, left: 1, bottom: 1, right: 2 }, true)).toBe(
      'refused: a table needs a row under its header, and this is one row',
    );
  });

  it('refuses a top row that does not name every column', () => {
    expect(tabled(SHEET, { top: 1, left: 1, bottom: 2, right: 3 }, true)).toBe(
      "refused: `C1` names no column, and a table's top row names every one of them",
    );
  });

  it('refuses a top row whose numbers are not names', () => {
    expect(tabled(SHEET, { top: 2, left: 1, bottom: 3, right: 2 }, true)).toBe(
      "refused: `B2` names no column, and a table's top row names every one of them",
    );
  });

  it('refuses two columns named the same, which Excel compares ignoring case', () => {
    const same =
      'sheets:\n  - name: S\n    cells:\n      A1: Region\n      B1: REGION\n      A2: APAC\n';
    expect(tabled(same, OVER, true)).toBe(
      "refused: `Region` names two columns, and a table's column names differ",
    );
  });

  it('refuses a region that overlaps a table already there', () => {
    const already = `${SHEET}    tables:\n      - at: A1:B2\n        name: Table1\n`;
    expect(tabled(already, OVER, true)).toBe(
      'refused: `A1:B2` is already part of a table, and tables may not overlap',
    );
  });

  it('refuses a region under the sheet’s own filter, since a table carries its own', () => {
    const filtered = `${SHEET}    filter: A1:B1\n`;
    expect(tabled(filtered, OVER, true)).toBe(
      "refused: `A1:B2` is under this sheet's filter, and a table carries its own",
    );
  });

  it('refuses a sheet that is not there', () => {
    const { doc, grid, read } = files(SHEET);
    const where = { sheet: 'Other' as SheetName, rect: OVER, on: true };
    expect(tableOver({ doc, grid }, where, read)).toEqual({
      kind: 'refused',
      why: 'there is no sheet named `Other`',
    });
  });
});
