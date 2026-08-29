import type { Axis } from '@yxl-vscode/spec';
import type { Rect, SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { setFilled } from './fill';
import { english, files, wrote } from './harness';
import type { Candidate } from './resolve';

const SALES = 'sheets:\n  - name: Sales\n';

const at = (top: number, left: number, bottom: number, right: number): Rect => ({
  top,
  left,
  bottom,
  right,
});

/** The answers a fill has, in the order they are offered. */
function offered(source: string, rect: Rect, axis: Axis = 'row'): readonly Candidate[] {
  const { doc, grid, read } = files(source);
  return setFilled({ doc, grid }, { sheet: 'Sales' as SheetName, rect, axis }, read);
}

/** The chosen answer, taken all the way through the checker. */
function taken(source: string, candidate: Candidate): string {
  const { intent } = candidate;
  return wrote(source, intent);
}

const HOLDS = `${SALES}    cells:\n      B1: 10\n      B2: 20\n      B3: 30\n`;

describe('a column of formulas filled down', () => {
  const spec = `${HOLDS}      C1: { formula: "B1*2" }\n`;

  it('is a range first, which is what a fill is in a spec', () => {
    expect(offered(spec, at(1, 3, 3, 3)).map((one) => [one.id, english(one.what)])).toEqual([
      ['range', 'Write one range, one formula that moves with the rows'],
      ['onCells', 'Write 2 cells of their own'],
    ]);
  });

  it('writes the range over the whole run, with the formula as it stands at the top', () => {
    const [range] = offered(spec, at(1, 3, 3, 3));
    if (range === undefined) throw new Error('nothing was offered');

    expect(taken(spec, range)).toBe(
      `${spec}    formulas:\n      - at: C1:C3\n        formula: "B1*2"\n`,
    );
  });

  it('writes a cell each where that is the answer taken, the references moved', () => {
    const [, cells] = offered(spec, at(1, 3, 3, 3));
    if (cells === undefined) throw new Error('nothing was offered');

    const done = taken(spec, cells);
    expect(done).toContain('      C2:\n        formula: "B2*2"\n');
    expect(done).toContain('      C3:\n        formula: "B3*2"\n');
  });

  it('goes in beside the ranges the sheet already has', () => {
    const held = `${spec}    formulas:\n      - at: D1:D3\n        formula: "B1*3"\n`;
    const [range] = offered(held, at(1, 3, 3, 3));
    if (range === undefined) throw new Error('nothing was offered');

    expect(taken(held, range)).toContain(
      '      - at: D1:D3\n        formula: "B1*3"\n      - at: C1:C3\n        formula: "B1*2"\n',
    );
  });
});

describe('what a fill will not make a range of', () => {
  it('a line of values, which a range has no formula to hold', () => {
    const spec = `${SALES}    cells:\n      A1: APAC\n`;

    expect(offered(spec, at(1, 1, 3, 1)).map((one) => one.id)).toEqual(['onCells']);
  });

  it('a run with a cell already written under it, which a range may not cross', () => {
    const spec = `${HOLDS}      C1: { formula: "B1*2" }\n      C3: kept\n`;

    expect(offered(spec, at(1, 3, 3, 3)).map((one) => one.id)).toEqual(['onCells']);
  });
});

describe('a row filled right', () => {
  it('moves the references across instead of down', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      B1: 2\n      C1: 3\n      A2: { formula: "A1*2" }\n`;
    const [, cells] = offered(spec, at(2, 1, 2, 3), 'column');
    if (cells === undefined) throw new Error('nothing was offered');

    expect(taken(spec, cells)).toContain('      B2:\n        formula: "B1*2"\n');
  });
});

describe('what a fill says nothing about', () => {
  it('a selection of one line, which has nothing to fill into', () => {
    expect(offered(`${HOLDS}`, at(1, 2, 1, 2))).toEqual([]);
  });

  it('a line with nothing written on it', () => {
    expect(offered(`${HOLDS}`, at(1, 9, 3, 9))).toEqual([]);
  });
});
