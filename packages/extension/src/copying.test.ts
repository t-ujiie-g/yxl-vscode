import { type CompiledSheet, compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import type { Rect } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { asText } from './copying';

function sheet(body: string): CompiledSheet {
  const { doc } = load(
    parse(`sheets:\n  - name: S\n    cells:\n${body}`, { file: 'spec.yxl.yaml' }),
  );
  if (doc === null) throw new Error('did not load');

  const one = compile(doc).sheets[0];
  if (one === undefined) throw new Error('compiled no sheet');
  return one;
}

const over = (top: number, left: number, bottom: number, right: number): Rect => ({
  top,
  left,
  bottom,
  right,
});

describe('a rectangle the host puts on the clipboard', () => {
  it('is tab-separated rows, in the order a spreadsheet reads them', () => {
    const spec = '      A1: Region\n      B1: Sold\n      A2: APAC\n      B2: 2400000\n';
    expect(asText(sheet(spec), over(1, 1, 2, 2), null)).toBe('Region\tSold\nAPAC\t2400000');
  });

  it('leaves a cell nothing writes empty, and keeps the row', () => {
    const spec = '      A1: one\n      B2: two\n';
    expect(asText(sheet(spec), over(1, 1, 2, 2), null)).toBe('one\t\n\ttwo');
  });

  it('quotes a field that holds what a row or a field ends on', () => {
    const spec = '      A1: "one\\ttwo"\n      B1: "a \\"quoted\\" word"\n';
    expect(asText(sheet(spec), over(1, 1, 1, 2), null)).toBe('"one\ttwo"\t"a ""quoted"" word"');
  });

  it('carries a formula where nothing has computed it, as the view does', () => {
    const spec = '      A1: 1\n      B1: { formula: "A1*2" }\n';
    expect(asText(sheet(spec), over(1, 1, 1, 2), null)).toBe('1\t=A1*2');
  });

  it('takes the runs of a rich cell as its text', () => {
    const spec =
      '      A1:\n        rich:\n          - "Figures are "\n          - { text: unaudited }\n';
    expect(asText(sheet(spec), over(1, 1, 1, 1), null)).toBe('Figures are unaudited');
  });
});
