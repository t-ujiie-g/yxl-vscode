import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { evaluate, univerEngine } from '@yxl-vscode/evaluate';
import { load } from '@yxl-vscode/loader';
import type { Rect } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { summed } from './summing';

const SALES = 'sheets:\n  - name: Sales\n';

/** What a rectangle of that spec comes to, computed as the preview computes it. */
function comes(source: string, rect: Rect, evaluated = false) {
  const { doc } = load(parse(source, { file: 'spec.yxl.yaml' }));
  if (doc === null) throw new Error('did not load');

  const grid = compile(doc);
  const sheet = grid.sheets[0];
  if (sheet === undefined) throw new Error('drew no sheet');

  return summed(sheet, rect, evaluated ? evaluate(grid, univerEngine()) : null);
}

const over = (top: number, left: number, bottom: number, right: number): Rect => ({
  top,
  left,
  bottom,
  right,
});

describe('what a rectangle comes to', () => {
  const CELLS = `${SALES}    cells:\n      A1: 10\n      A2: 20\n      A3: APAC\n`;

  it('counts what holds anything, and adds up the numbers among it', () => {
    expect(comes(CELLS, over(1, 1, 3, 1))).toEqual({ held: 3, numbers: 2, sum: 30 });
  });

  it('counts nothing where the rectangle holds nothing', () => {
    expect(comes(CELLS, over(5, 5, 9, 9))).toEqual({ held: 0, numbers: 0, sum: 0 });
  });

  it('leaves a formula out of the sum until it has been computed', () => {
    const spec = `${SALES}    cells:\n      A1: 10\n      A2: { formula: "A1*2" }\n`;
    expect(comes(spec, over(1, 1, 2, 1))).toEqual({ held: 2, numbers: 1, sum: 10 });
  });

  it('adds what a formula came to, since that is the number a reader sees (ADR-014)', () => {
    const spec = `${SALES}    cells:\n      A1: 10\n      A2: { formula: "A1*2" }\n`;
    expect(comes(spec, over(1, 1, 2, 1), true)).toEqual({ held: 2, numbers: 2, sum: 30 });
  });

  it('counts a cell a `formulas:` range fills, which is a cell like any other', () => {
    const spec = `${SALES}    cells:\n      A1: 10\n    formulas:\n      - at: B1:B3\n        formula: "A1"\n`;
    expect(comes(spec, over(1, 1, 3, 2)).held).toBe(4);
  });
});
