import { describe, expect, it } from 'vitest';
import { english, spec, taken } from './harness';
import type { Ranging } from './proposal';
import { rangeFormulas, rangePatch, WORTH_RANGING } from './ranges';

/** A column of cells each translating one formula down a row, as a person writes one. */
function column(rows: number, from = 2): string {
  const cells = Array.from(
    { length: rows },
    (_, i) => `      C${from + i}: { formula: "B${from + i}*1.1" }\n`,
  ).join('');

  return `sheets:\n  - name: Sales\n    cells:\n      A1: 支店\n${cells}`;
}

describe('a column of formulas that each translate one', () => {
  it('offers to say it once, as the range that fills it', () => {
    const found = rangeFormulas(spec(column(3)));

    expect(
      found.map((one) => ({ over: one.over, formula: one.formula, at: one.at.length })),
    ).toEqual([{ over: 'C2:C4', formula: 'B2*1.1', at: 3 }]);
  });

  it('says what it would gather, in the reader s own words', () => {
    const [one] = rangeFormulas(spec(column(4)));

    expect(english(one?.what ?? '')).toBe(
      'Say the 4 formulas over `C2:C5` once, as the range that fills them',
    );
  });

  it('leaves a run alone that is too short to be worth a range', () => {
    expect(rangeFormulas(spec(column(WORTH_RANGING - 1)))).toEqual([]);
  });

  it('leaves alone a column whose formulas do not translate one another', () => {
    const source =
      'sheets:\n  - name: Sales\n    cells:\n' +
      '      C2: { formula: "B2*1.1" }\n' +
      '      C3: { formula: "B3*1.2" }\n' +
      '      C4: { formula: "B4*1.1" }\n';

    expect(rangeFormulas(spec(source))).toEqual([]);
  });

  it('leaves alone a cell that wears a look, since a range carries none', () => {
    const source =
      'sheets:\n  - name: Sales\n    cells:\n' +
      '      C2: { formula: "B2*1.1" }\n' +
      '      C3: { formula: "B3*1.1", style: { font: { bold: true } } }\n' +
      '      C4: { formula: "B4*1.1" }\n';

    expect(rangeFormulas(spec(source))).toEqual([]);
  });

  it('breaks a run where a row is missing, rather than reaching over the gap', () => {
    const source =
      'sheets:\n  - name: Sales\n    cells:\n' +
      '      C2: { formula: "B2*1.1" }\n' +
      '      C3: { formula: "B3*1.1" }\n' +
      '      C5: { formula: "B5*1.1" }\n';

    expect(rangeFormulas(spec(source))).toEqual([]);
  });
});

describe('the patch a range makes', () => {
  function ranged(source: string) {
    const of = spec(source);

    return taken(of, rangePatch(rangeFormulas(of)[0] as Ranging));
  }

  it('writes the range and takes away every cell it replaces', () => {
    const { text } = ranged(column(3));

    expect(text).toBe(
      'sheets:\n  - name: Sales\n    cells:\n      A1: 支店\n' +
        '    formulas:\n      - { at: C2:C4, formula: "B2*1.1" }\n',
    );
  });

  it('passes the gate that says a refactor changes no rendered cell', () => {
    expect(ranged(column(3)).passes).toBe(true);
  });

  it('joins a `formulas:` sequence the sheet already writes', () => {
    const source = `${column(3)}    formulas:\n      - { at: D2:D4, formula: "C2*2" }\n`;
    const { text, passes } = ranged(source);

    expect([text.includes('at: C2:C4'), text.includes('at: D2:D4'), passes]).toEqual([
      true,
      true,
      true,
    ]);
  });
});
