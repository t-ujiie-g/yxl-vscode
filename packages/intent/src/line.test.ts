import type { Line, SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { files, tried } from './harness';
import { drawLine, setLine } from './line';

const SALES = 'sheets:\n  - name: Sales\n';

const row = (at: number, by = 1): Line => ({ sheet: 'Sales' as SheetName, axis: 'row', at, by });
const column = (at: number, by = 1): Line => ({
  sheet: 'Sales' as SheetName,
  axis: 'column',
  at,
  by,
});

/** The line drawn, all the way through the checker — the text, or why not. */
function drawn(source: string, line: Line): string {
  const { doc, grid, read } = files(source);
  const intent = drawLine({ doc, grid }, line, read);
  return tried(source, intent);
}

describe('a row inserted', () => {
  it('moves the keys of the cells at it and below, and leaves the ones above', () => {
    const spec = `${SALES}    cells:\n      A1: Region\n      A5: Total\n      B5: 2\n`;

    expect(drawn(spec, row(5))).toBe(
      `${SALES}    cells:\n      A1: Region\n      A6: Total\n      B6: 2\n`,
    );
  });

  it('moves what a formula names, so it goes on saying the same thing', () => {
    const spec = `${SALES}    cells:\n      A5: 2\n      B1: { formula: "A5*2" }\n`;

    expect(drawn(spec, row(5))).toContain('B1: { formula: "A6*2" }');
  });

  it('grows a range it falls inside, and leaves the formula where the anchor did not move', () => {
    const spec = `${SALES}    cells:\n      A1: 2\n    formulas:\n      - at: C2:C8\n        formula: "A1*2"\n`;

    expect(drawn(spec, row(5))).toContain('      - at: C2:C9\n        formula: "A1*2"\n');
  });

  it('moves a range below it, and the formula with it', () => {
    const spec = `${SALES}    cells:\n      A9: 2\n    formulas:\n      - at: C9:C10\n        formula: "A9*2"\n`;

    expect(drawn(spec, row(5))).toContain('      - at: C10:C11\n        formula: "A10*2"\n');
  });

  it('opens a gap in an inline data block it falls inside', () => {
    const spec = `${SALES}    data:\n      - at: A2\n        values:\n          - [APAC]\n          - [EMEA]\n`;

    expect(drawn(spec, row(3))).toContain(
      '        values:\n          - [APAC]\n          - []\n          - [EMEA]\n',
    );
  });

  it('moves a data block below it by its anchor', () => {
    const spec = `${SALES}    data:\n      - at: A9\n        values:\n          - [APAC]\n`;

    expect(drawn(spec, row(5))).toContain('      - at: A10\n');
  });

  it('moves a band, a merge and the freeze', () => {
    const spec = `${SALES}    freeze: A6\n    rows:\n      - at: 6\n        height: 20\n    merges: [A6:B6]\n    cells:\n      A1: 2\n`;
    const done = drawn(spec, row(5));

    expect(done).toContain('freeze: A7');
    expect(done).toContain('      - at: 7\n');
    expect(done).toContain('merges: [A7:B7]');
  });

  it('says so where nothing it reaches moves', () => {
    expect(drawn(`${SALES}    cells:\n      A1: 1\n`, row(9))).toBe(
      'refused: nothing here moves when row 9 is drawn',
    );
  });
});

describe('a column inserted', () => {
  it('moves the cells to its right, and the block whose rows start past it', () => {
    const spec = `${SALES}    cells:\n      C1: Total\n    data:\n      - at: C2\n        values:\n          - [APAC]\n`;
    const done = drawn(spec, column(2));

    expect(done).toContain('      D1: Total\n');
    expect(done).toContain('      - at: D2\n');
  });

  it('puts a blank field into every row of a block it falls inside', () => {
    const spec = `${SALES}    data:\n      - at: A2\n        values:\n          - [APAC, 1]\n          - [EMEA, 2]\n`;

    expect(drawn(spec, column(2))).toContain(
      '          - [APAC, null, 1]\n          - [EMEA, null, 2]\n',
    );
  });

  it('puts as many in as the reader asked for, all at the one place', () => {
    const spec = `${SALES}    data:\n      - at: A2\n        values:\n          - [APAC, 1]\n`;

    expect(drawn(spec, column(2, 2))).toContain('          - [APAC, null, null, 1]\n');
  });

  it('puts one into rows written a line at a time', () => {
    const spec = `${SALES}    data:\n      - at: A2\n        values:\n          - - APAC\n            - 1\n`;

    expect(drawn(spec, column(2))).toContain(
      '          - - APAC\n            - null\n            - 1\n',
    );
  });

  it('takes a field out again where the line takes the column away', () => {
    const spec = `${SALES}    data:\n      - at: A2\n        values:\n          - [APAC, 1, 2]\n`;

    expect(drawn(spec, column(2, -1))).toContain('          - [APAC, 2]\n');
  });

  it('takes them one at a time out of rows written as `[a, b]`', () => {
    const spec = `${SALES}    data:\n      - at: A2\n        values:\n          - [APAC, 1, 2]\n`;

    expect(drawn(spec, column(2, -2))).toBe(
      'refused: rows written as `[a, b]` give up one field at a time, so take these away one by one',
    );
  });
});

describe('a row taken away', () => {
  it('takes the cells inside it and closes the gap under them', () => {
    const spec = `${SALES}    cells:\n      A1: Region\n      A5: Total\n      A9: Sum\n`;

    expect(drawn(spec, row(5, -1))).toBe(`${SALES}    cells:\n      A1: Region\n      A8: Sum\n`);
  });

  it('shrinks a range it takes part of', () => {
    const spec = `${SALES}    cells:\n      A1: 2\n    formulas:\n      - at: C4:C8\n        formula: "1*2"\n`;

    expect(drawn(spec, row(5, -1))).toContain('      - at: C4:C7\n');
  });

  it('refuses where a *filled* cell would name a row it takes away, as Excel would `#REF!`', () => {
    const spec = `${SALES}    cells:\n      A1: 2\n    formulas:\n      - at: C4:C8\n        formula: "A1*2"\n`;

    // C8 applies the range's formula as `A5*2`, and row 5 is what is going.
    expect(drawn(spec, row(5, -1))).toBe(
      'refused: `C8` holds `=A5*2`, and `A5` names a row this would take away',
    );
  });

  it('takes a row out of an inline data block', () => {
    const spec = `${SALES}    data:\n      - at: A2\n        values:\n          - [APAC]\n          - [EMEA]\n          - [LATAM]\n`;

    expect(drawn(spec, row(3, -1))).toContain(
      '        values:\n          - [APAC]\n          - [LATAM]\n',
    );
  });

  it('takes the row’s own formula away with it, rather than asking it to survive', () => {
    // Every row of a table totals itself; deleting one must not be refused by
    // the total that goes with it.
    const spec = `${SALES}    cells:\n      A4: 1\n      A5: 2\n      A6: 3\n    formulas:\n      - at: B4:B6\n        formula: "SUM(A4:A4)"\n`;

    expect(drawn(spec, row(5, -1))).toContain('      - at: B4:B5\n');
  });

  it('refuses where a formula names a row it would take away', () => {
    const spec = `${SALES}    cells:\n      A5: 2\n      B1: { formula: "A5*2" }\n`;

    expect(drawn(spec, row(5, -1))).toBe(
      'refused: `B1` holds `=A5*2`, and `A5` names a row this would take away',
    );
  });
});

describe('what a line offers to move', () => {
  it('names the sheet whole where the name holds a `!`', () => {
    const spec = 'sheets:\n  - name: Q!1\n    cells:\n      A1: 1\n';
    const { doc, grid, read } = files(spec);
    const line: Line = { sheet: 'Q!1' as SheetName, axis: 'row', at: 1, by: 1 };

    expect(setLine({ doc, grid }, line, read)[0]?.moves).toEqual([
      { sheet: 'Q!1', at: 'A1' },
      { sheet: 'Q!1', at: 'A2' },
    ]);
  });
});

describe('what else names a place, moved with the line (#206)', () => {
  const NAMED = `${SALES}    cells:
      A3: APAC
      B3: 10
      A4: EMEA
      B4: 20
`;

  it.each([
    ['a note', '    comments:\n      A3: "check this"\n', '      A4: "check this"\n'],
    ['a link', '    links:\n      A3: { to: "Sales!B3" }\n', '      A4: { to: "Sales!B4" }\n'],
    [
      'a rule, its range and its formula',
      '    conditional:\n      - { at: A3:A4, formula: "B3>15", style: { fill: "FF0000" } }\n',
      '      - { at: A4:A5, formula: "B4>15", style: { fill: "FF0000" } }\n',
    ],
    [
      'a list, its range and where it reads from',
      '    validations:\n      - { at: A3:A4, list: { from: B3:B4 } }\n',
      '      - { at: A4:A5, list: { from: B4:B5 } }\n',
    ],
    ['a filter', '    filter: A3:B4\n', '    filter: A4:B5\n'],
    [
      'the print area and its breaks',
      '    print:\n      area: A3:B4\n      breaks: [A4]\n',
      '    print:\n      area: A4:B5\n      breaks: [A5]\n',
    ],
    ['a table', '    tables:\n      - at: A3:B4\n', '      - at: A4:B5\n'],
    [
      'a chart, where it sits and what it plots',
      '    charts:\n      - { type: column, at: D3, series: [{ values: B3:B4, categories: A3:A4 }] }\n',
      '      - { type: column, at: D4, series: [{ values: B4:B5, categories: A4:A5 }] }\n',
    ],
    [
      'a sparkline, written either way',
      '    sparklines:\n      - { at: C3, data: B3:B4 }\n      - cells:\n          - { at: C4, data: A4:B4 }\n',
      '      - { at: C4, data: B4:B5 }\n      - cells:\n          - { at: C5, data: A5:B5 }\n',
    ],
  ])('%s', (_label, keys, after) => {
    expect(drawn(`${NAMED}${keys}`, row(1))).toContain(after);
  });

  it('moves a formula on another sheet that names a cell the line moves', () => {
    const spec = `${NAMED}  - name: Summary\n    cells:\n      A1: { formula: "Sales!B4*2" }\n`;

    expect(drawn(spec, row(1))).toContain('A1: { formula: "Sales!B5*2" }');
  });

  it('moves a `defs.formulas` body, and leaves a cell that reads it as written', () => {
    const spec = `${NAMED}      C3: { formula: { $ref: double } }\ndefs:\n  formulas:\n    double: "Sales!B3*2"\n`;
    const done = drawn(spec, row(1));

    expect(done).toContain('      C4: { formula: { $ref: double } }\n');
    expect(done).toContain('    double: "Sales!B4*2"\n');
  });

  it('moves an override with the cell it is over', () => {
    const spec = `${NAMED}overrides:\n  - at: Sales!B4\n    value: 99\n`;
    const done = drawn(spec, row(1));

    expect(done).toContain('      B5: 20\n');
    expect(done).toContain('  - at: Sales!B5\n');
  });

  it('moves a layout that sits below the line', () => {
    const spec = `${SALES}    layouts:\n      - at: A3\n        values: [[a, 1]]\n        columns: [{ name: n, header: N }, { name: v }]\n`;

    expect(drawn(spec, row(1))).toContain('      - at: A4\n');
  });

  it('takes the note, the link and the sparkline of a row it takes away, and the key with the last', () => {
    const spec = `${NAMED}    comments:\n      A3: "check this"\n    links:\n      A3: { to: "Sales!B4" }\n    sparklines:\n      - { at: C3, data: A4:B4 }\n`;

    expect(drawn(spec, row(3, -1))).toBe(`${SALES}    cells:\n      A3: EMEA\n      B3: 20\n`);
  });
});

describe('a construct the line takes away', () => {
  it('is not asked whether what it refers to survives, since it goes too', () => {
    const spec = `${SALES}    cells:\n      A3: 1\n      A4: 2\n    sparklines:\n      - { at: C3, data: A3:B3 }\n    conditional:\n      - { at: A3:A3, formula: "A3>0", style: { fill: "FF0000" } }\n`;

    expect(drawn(spec, row(3, -1))).toBe(`${SALES}    cells:\n      A3: 2\n`);
  });
});

describe('a chart whose row is taken away', () => {
  it('stays on the row that takes its place, as Excel keeps it', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n    charts:\n      - { type: column, at: D3, series: [{ values: A1:A1 }] }\n      - { type: column, at: D9, series: [{ values: A1:A1 }] }\n`;
    const done = drawn(spec, row(3, -2));

    expect(done).toContain('      - { type: column, at: D3,');
    expect(done).toContain('      - { type: column, at: D7,');
  });
});

describe('a data block whose first row or column is all blanks (#215)', () => {
  it('opens a gap by where its `at:` says it starts', () => {
    const spec = `${SALES}    data:\n      - at: A1\n        values:\n          - [null, 1]\n          - [null, 2]\n`;

    expect(drawn(spec, column(1))).toBe(
      `${SALES}    data:\n      - at: B1\n        values:\n          - [null, 1]\n          - [null, 2]\n`,
    );
  });

  it('moves by its `at:` when the line goes in above it', () => {
    const spec = `${SALES}    data:\n      - at: A2\n        values:\n          - [null, null]\n          - [x, 2]\n`;

    expect(drawn(spec, row(1))).toBe(
      `${SALES}    data:\n      - at: A3\n        values:\n          - [null, null]\n          - [x, 2]\n`,
    );
  });
});

describe('what a line will not move, and says why (#206)', () => {
  it('a layout it would cut through', () => {
    const spec = `${SALES}    layouts:\n      - at: A3\n        values: [[a, 1], [b, 2]]\n        columns: [{ name: n, header: N }, { name: v }]\n`;

    expect(drawn(spec, row(4))).toBe(
      'refused: a layout draws rows 3-5, and moves only whole, so draw lines above or below it',
    );
  });

  it('a table it would leave without its header or a row of data', () => {
    const spec = `${SALES}    cells:\n      A2: Name\n      A3: x\n    tables:\n      - at: A2:A3\n`;

    expect(drawn(spec, row(2, -1))).toBe(
      'refused: the table at `A2:A3` would lose its header row or be left with no row of data',
    );
  });

  it('a reference that names the row it takes away', () => {
    const spec = `${SALES}    cells:\n      A3: 1\n      A4: 2\n    validations:\n      - { at: B1:B1, list: { from: A3:A4 } }\n`;

    expect(drawn(spec, row(4, -1))).toBe(
      'refused: `Sales!B1:B1` refers to `A3:A4`, and `A4` names a row this would take away',
    );
  });
});
