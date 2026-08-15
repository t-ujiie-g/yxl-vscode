import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import { describe, expect, it } from 'vitest';
import { type Change, diff } from './diff';

function grid(source: string) {
  const { doc } = load(parse(source, { file: 'spec.yxl.yaml' }));
  if (doc === null) throw new Error('did not load');
  return compile(doc);
}

function between(before: string, after: string): Change[] {
  return diff(grid(before), grid(after));
}

const SALES = 'sheets:\n  - name: Sales\n';

describe('what two compilations disagree about', () => {
  it('says nothing about a file that did not change', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    expect(between(spec, spec)).toEqual([]);
  });

  it('says nothing about a comment, or a quote, or a line break', () => {
    // The grid is what a reader sees; how the spec was spelled is not part of
    // it, and an edit that only respells something has changed nothing.
    const before = `${SALES}    cells:\n      A1: 1\n`;
    const after = `${SALES}    cells:\n      # a note\n      A1: 1\n`;

    expect(between(before, after)).toEqual([]);
  });

  it('names a value that moved', () => {
    const before = `${SALES}    cells:\n      A1: 1\n`;
    const after = `${SALES}    cells:\n      A1: 2\n`;

    expect(between(before, after)).toEqual([
      { kind: 'cell', sheet: 'Sales', at: 'A1', what: 'value' },
    ]);
  });

  it('names a look that moved, wherever it was written', () => {
    const before = `${SALES}    columns:\n      - at: A\n        style: money\n    cells:\n      A1: 1\ndefs:\n  styles:\n    money: { format: "#,##0" }\n`;
    const after = before.replace('"#,##0"', '"0.00"');

    expect(between(before, after)).toEqual([
      { kind: 'cell', sheet: 'Sales', at: 'A1', what: 'style' },
    ]);
  });

  it('names a formula that moved', () => {
    const before = `${SALES}    cells:\n      A1: { formula: "1+1" }\n`;
    const after = `${SALES}    cells:\n      A1: { formula: "2+2" }\n`;

    expect(between(before, after)).toEqual([
      { kind: 'cell', sheet: 'Sales', at: 'A1', what: 'formula' },
    ]);
  });

  it('names a cell that appeared, and one that went', () => {
    const one = `${SALES}    cells:\n      A1: 1\n`;
    const two = `${SALES}    cells:\n      A1: 1\n      A2: 2\n`;

    expect(between(one, two)).toEqual([{ kind: 'cell', sheet: 'Sales', at: 'A2', what: 'value' }]);
    expect(between(two, one)).toEqual([{ kind: 'cell', sheet: 'Sales', at: 'A2', what: 'value' }]);
  });

  it('names the cells a `formulas:` range covers, not only the range', () => {
    const before = `${SALES}    cells:\n      A1: 1\n    formulas:\n      - at: B1:B3\n        formula: "A1"\n`;
    const after = before.replace('formula: "A1"', 'formula: "A1*2"');

    expect(between(before, after).map((one) => one.kind === 'cell' && one.at)).toEqual([
      'B1',
      'B2',
      'B3',
    ]);
  });

  it('names a sheet that appeared, and one that went', () => {
    const one = `${SALES}    cells:\n      A1: 1\n`;
    const two = `${one}  - name: Notes\n`;

    expect(between(one, two)).toEqual([{ kind: 'sheet', name: 'Notes', what: 'added' }]);
    expect(between(two, one)).toEqual([{ kind: 'sheet', name: 'Notes', what: 'removed' }]);
  });

  it('takes a renamed sheet as one going and another arriving', () => {
    // Identity here is the name, because the name is what a formula elsewhere
    // reaches a sheet by. A rename really is a different sheet to a reader.
    const before = `${SALES}    cells:\n      A1: 1\n`;
    const after = before.replace('name: Sales', 'name: Revenue');

    expect(
      between(before, after)
        .map((one) => one.kind === 'sheet' && one.what)
        .sort(),
    ).toEqual(['added', 'removed']);
  });
});
