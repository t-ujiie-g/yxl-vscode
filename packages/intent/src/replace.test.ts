import { finds } from '@yxl-vscode/compile';
import type { A1Addr, SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { english, files, tried } from './harness';
import { replaceIn } from './replace';

const SHEET = 'S' as SheetName;

/** Every cell the search turns up, replaced in one edit — the file after it, or why not. */
function replaced(source: string, looking: string, becomes: string): string {
  const { doc, grid, read } = files(source);
  const sheet = grid.sheets[0];
  if (sheet === undefined) throw new Error('compiled no sheet');

  const where = { sheet: SHEET, at: finds(sheet, looking), looking, becomes };

  return tried(source, replaceIn({ doc, grid }, where, read));
}

const SPEC = 'sheets:\n  - name: S\n    cells:\n';

describe('what a find turned up, replaced', () => {
  it('writes every cell that holds it, in one edit', () => {
    const spec = `${SPEC}      A1: APAC sales\n      A2: EMEA sales\n      A3: APAC total\n`;
    expect(replaced(spec, 'APAC', 'LATAM')).toBe(
      `${SPEC}      A1: LATAM sales\n      A2: EMEA sales\n      A3: LATAM total\n`,
    );
  });

  it('finds without case and puts back what was typed, as a find does', () => {
    const spec = `${SPEC}      A1: apac\n      A2: APAC\n`;
    expect(replaced(spec, 'Apac', 'EMEA')).toBe(`${SPEC}      A1: EMEA\n      A2: EMEA\n`);
  });

  it('replaces every match in one cell, not the first', () => {
    const spec = `${SPEC}      A1: one and one\n`;
    expect(replaced(spec, 'one', 'two')).toBe(`${SPEC}      A1: two and two\n`);
  });

  it('takes the type the new text has, as typing it would', () => {
    // `holding` reads the text the way a reader's keystrokes are read, so a
    // number stays a number and does not become a string of digits.
    const spec = `${SPEC}      A1: 2400000\n`;
    expect(replaced(spec, '24', '25')).toBe(`${SPEC}      A1: 2500000\n`);
  });

  it('writes a formula back as a formula, since that is what the search matched', () => {
    const spec = `${SPEC}      A1: 1\n      B1: { formula: "SUM(A1:A9)" }\n`;
    expect(replaced(spec, 'SUM', 'MAX')).toBe(
      `${SPEC}      A1: 1\n      B1: { formula: "MAX(A1:A9)" }\n`,
    );
  });

  it('refuses the whole where one of them cannot take it, and counts what stood in the way', () => {
    // The range's anchor is found by the search, and changing a formula there
    // changes every cell it fills — an answer to be taken, not a replacement.
    const spec = `${SPEC}      A1: 1\n      A2: 2\n    formulas:\n      - at: B1:B2\n        formula: "A1*2"\n`;
    const said = replaced(spec, 'A1', 'A2');

    expect(said).toContain('cannot be replaced, so none were');
    expect(said).toContain('range');
  });

  it('counts a cell found by the value cached under its formula, rather than passing over it', () => {
    // `finds` matches what a cell holds, which for a formula cell includes the
    // result Excel cached there — and typing over that is writing down a guess.
    const spec = `${SPEC}      A1: 1\n      B1: { formula: "SUM(A1:A9)", value: 4150000 }\n      C1: 4150000\n`;
    const said = replaced(spec, '4150000', '99');

    expect(said).toContain('1 of the 2 cells here cannot be replaced, so none were');
    expect(said).toContain('the value cached under it');
  });

  it('writes the ones that can be, where the reader takes that answer', () => {
    const spec = `${SPEC}      A1: 1\n      B1: { formula: "SUM(A1:A9)", value: 4150000 }\n      C1: 4150000\n`;
    const { doc, grid, read } = files(spec);
    const sheet = grid.sheets[0];
    if (sheet === undefined) throw new Error('compiled no sheet');

    const where = { sheet: SHEET, at: finds(sheet, '4150000'), looking: '4150000', becomes: '99' };
    const intent = replaceIn({ doc, grid }, where, read, 'skip');

    expect(tried(spec, intent)).toBe(
      `${SPEC}      A1: 1\n      B1: { formula: "SUM(A1:A9)", value: 4150000 }\n      C1: 99\n`,
    );
  });

  it('says so where nothing holds it any more', () => {
    expect(replaced(`${SPEC}      A1: one\n`, 'nowhere', 'x')).toBe(
      'refused: nothing on `S` holds that any more',
    );
  });

  it('refuses a search for nothing, and a sheet that is not there', () => {
    const { doc, grid, read } = files(`${SPEC}      A1: one\n`);
    const nothing = { sheet: SHEET, at: ['A1' as A1Addr], looking: '', becomes: 'x' };
    const none = replaceIn({ doc, grid }, nothing, read);
    expect(none.kind === 'refused' && english(none.why)).toBe('there is nothing to look for');

    const elsewhere = { sheet: 'Other' as SheetName, at: [], looking: 'one', becomes: 'x' };
    const other = replaceIn({ doc, grid }, elsewhere, read);
    expect(other.kind === 'refused' && english(other.why)).toBe('there is no sheet named `Other`');
  });
});
