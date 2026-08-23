import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type FilePath, filePath, type Line, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { reading } from './direct';
import { drawLine } from './line';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);
const SALES = 'sheets:\n  - name: Sales\n';

function files(source: string) {
  const includes: IncludeReader = (_from, path) => (path === ROOT ? { file: ROOT, source } : null);
  const { doc } = load(parse(source, { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return { doc, grid: compile(doc, { read: includes }), read: reading(() => source), includes };
}

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
  if (intent.kind === 'refused') return `refused: ${intent.why}`;
  if (intent.kind !== 'edit') throw new Error('a file was not written');

  const { includes } = files(source);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);

  return done.ok === false ? `refused: ${done.diagnostics[0]?.message ?? 'a surprise'}` : done.text;
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

  it('will not put a field into rows written as `[a, b]`', () => {
    const spec = `${SALES}    data:\n      - at: A2\n        values:\n          - [APAC, 1]\n`;

    expect(drawn(spec, column(2))).toBe(
      'refused: the rows here are written as `[a, b]`, which this cannot put a field into',
    );
  });

  it('puts one into rows written a line at a time', () => {
    const spec = `${SALES}    data:\n      - at: A2\n        values:\n          - - APAC\n            - 1\n`;

    expect(drawn(spec, column(2))).toContain(
      '          - - APAC\n            - null\n            - 1\n',
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
