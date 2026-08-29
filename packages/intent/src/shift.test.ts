import { type CompiledSheet, compile, type DataReader } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type FilePath, filePath, type Line, type SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { english } from './harness';
import { type Moving, shifting } from './shift';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);
const SALES = 'sheets:\n  - name: Sales\n';

function sheet(source: string, files: Record<string, string> = {}): CompiledSheet {
  const read: IncludeReader = (_from, path) => (path === ROOT ? { file: ROOT, source } : null);
  const data: DataReader = (_from, path) => {
    const held = files[path];
    return held === undefined ? null : { file: path, source: held };
  };

  const { doc } = load(parse(source, { file: ROOT }), read);
  if (doc === null) throw new Error('did not load');

  const one = compile(doc, { read: data }).sheets[0];
  if (one === undefined) throw new Error('no sheet');

  return one;
}

/** A row inserted above `at`, or the rows a delete takes from there. */
const row = (at: number, by = 1): Line => ({ sheet: 'Sales' as SheetName, axis: 'row', at, by });
const column = (at: number, by = 1): Line => ({
  sheet: 'Sales' as SheetName,
  axis: 'column',
  at,
  by,
});

/** What moves, as `what it is`:`what it does`, in the order the sheet holds them. */
const what = (moves: readonly Moving[]) =>
  moves.map((one) => `${one.of}:${one.does}${one.at === null ? '' : `:${one.at}`}`);

describe('what a row inserted would move', () => {
  const spec = `${SALES}    cells:\n      A1: Region\n      A5: Total\n      B5: 2\n`;

  it('moves the cells at the line and past it, and leaves the ones above', () => {
    const { moves, stops } = shifting(sheet(spec), row(5));

    expect(what(moves)).toEqual(['cell:shifts:A5', 'cell:shifts:B5']);
    expect(stops).toEqual([]);
  });

  it('moves nothing where the line is past everything', () => {
    expect(shifting(sheet(spec), row(9)).moves).toEqual([]);
  });

  it('counts a column the same way, along the other axis', () => {
    expect(what(shifting(sheet(spec), column(2)).moves)).toEqual(['cell:shifts:B5']);
  });
});

describe('what a row inserted does to the constructs around the cells', () => {
  it('grows a range the line falls inside, and moves one below it', () => {
    const spec = `${SALES}    cells:\n      A1: 2\n    formulas:\n      - at: C2:C8\n        formula: "A1*2"\n`;

    expect(what(shifting(sheet(spec), row(5)).moves)).toEqual(['formulas:grows']);
    expect(what(shifting(sheet(spec), row(2)).moves)).toEqual(['formulas:shifts']);
  });

  it('grows an inline data block the line falls inside', () => {
    const spec = `${SALES}    data:\n      - at: A2\n        values:\n          - [APAC]\n          - [EMEA]\n          - [LATAM]\n`;

    expect(what(shifting(sheet(spec), row(3)).moves)).toEqual(['data:grows']);
    expect(what(shifting(sheet(spec), row(2)).moves)).toEqual(['data:shifts']);
  });

  it('will not open a gap in rows that come from a file', () => {
    const spec = `${SALES}    data:\n      - at: A2\n        csv: rows.csv\n`;
    const drawn = sheet(spec, { 'rows.csv': 'APAC\nEMEA\nLATAM\n' });

    expect(shifting(drawn, row(3)).stops.map(english)).toEqual([
      'the rows here come from `rows.csv`, which this cannot open a gap in',
    ]);
    expect(shifting(drawn, row(3)).moves).toEqual([]);
  });

  it('moves a band, a merge and the freeze the same way', () => {
    const spec = `${SALES}    freeze: A4\n    rows:\n      - at: 6\n        height: 20\n    merges: [A5:B5]\n    cells:\n      A1: 2\n`;
    const done = shifting(sheet(spec), row(5));

    expect(what(done.moves).sort()).toEqual(['band:shifts', 'merge:shifts']);
  });

  it('moves the freeze where the line is at it or above it', () => {
    const spec = `${SALES}    freeze: B4\n    cells:\n      A1: 2\n`;

    expect(what(shifting(sheet(spec), row(4)).moves)).toEqual(['freeze:shifts:B4']);
    expect(shifting(sheet(spec), row(5)).moves).toEqual([]);
  });
});

describe('what a row taken away would move', () => {
  const spec = `${SALES}    cells:\n      A1: Region\n      A5: Total\n      A9: Sum\n`;

  it('takes the cells inside it and closes the gap under them', () => {
    expect(what(shifting(sheet(spec), row(5, -1)).moves)).toEqual([
      'cell:goes:A5',
      'cell:shifts:A9',
    ]);
  });

  it('takes a run of rows at once', () => {
    expect(what(shifting(sheet(spec), row(5, -5)).moves)).toEqual(['cell:goes:A5', 'cell:goes:A9']);
  });

  it('shrinks a range the line takes part of, and takes one it takes whole', () => {
    const range = `${SALES}    cells:\n      A1: 2\n    formulas:\n      - at: C4:C8\n        formula: "A1*2"\n`;

    expect(what(shifting(sheet(range), row(5, -1)).moves)).toEqual(['formulas:shrinks']);
    expect(what(shifting(sheet(range), row(4, -5)).moves)).toEqual(['formulas:goes']);
  });

  it('stops where a formula names a row it would take away', () => {
    const spec = `${SALES}    cells:\n      A5: 2\n      B1: { formula: "A5*2" }\n`;

    expect(shifting(sheet(spec), row(5, -1)).stops.map(english)).toEqual([
      '`B1` holds `=A5*2`, and `A5` names a row this would take away',
    ]);
  });
});
