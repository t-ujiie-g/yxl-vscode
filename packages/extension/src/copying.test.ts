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
  it('is what the view would have put there, drawn the same way', () => {
    // The rules themselves are `fields.test.ts`'s; what this pins is that the
    // host goes through them rather than writing its own text (ADR-035).
    const spec = '      A1: Region\n      B1: Sold\n      A2: APAC\n      B2: 2400000\n';
    expect(asText(sheet(spec), over(1, 1, 2, 2), null)).toBe('Region\tSold\nAPAC\t2400000');
  });

  it('carries a formula where nothing has computed it, and a rich cell as its text', () => {
    const spec =
      '      A1: { formula: "SUM(B1:B2)" }\n      A2:\n        rich:\n          - "Figures are "\n          - { text: unaudited }\n';
    expect(asText(sheet(spec), over(1, 1, 2, 1), null)).toBe('=SUM(B1:B2)\nFigures are unaudited');
  });

  it('reaches past the window the view draws, which is why the host does it at all', () => {
    const rows = Array.from({ length: 400 }, (_, index) => `      A${index + 1}: ${index + 1}\n`);
    const said = asText(sheet(rows.join('')), over(1, 1, 400, 1), null);

    expect(said.split('\n')).toHaveLength(400);
    expect(said.split('\n').at(-1)).toBe('400');
  });
});
