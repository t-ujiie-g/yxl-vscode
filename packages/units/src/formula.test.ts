import { describe, expect, it } from 'vitest';
import { moved, type Offset } from './formula';

/** The formula as it applies `by` away, or the reason it does not apply there. */
function to(formula: string, by: Offset): string {
  const done = moved(formula, by);
  return done.ok ? done.formula : `refused: ${done.why}`;
}

const DOWN = { cols: 0, rows: 1 };
const RIGHT = { cols: 1, rows: 0 };
const OVER = { cols: 2, rows: 3 };

describe('a formula moved', () => {
  it('moves a reference by the columns and rows given', () => {
    expect(to('A2*0.1', OVER)).toBe('C5*0.1');
  });

  it('comes back byte for byte where it does not move at all', () => {
    expect(to('SUM(a01:$B$2)', { cols: 0, rows: 0 })).toBe('SUM(a01:$B$2)');
  });

  it('moves both ends of a range', () => {
    expect(to('SUM(B2:B4)', DOWN)).toBe('SUM(B3:B5)');
  });

  it('leaves a `$`-anchored half where it is', () => {
    expect(to('$B$2', OVER)).toBe('$B$2');
    expect(to('$B2', OVER)).toBe('$B5');
    expect(to('B$2', OVER)).toBe('D$2');
  });

  it('leaves the half that does not move written exactly as it was', () => {
    // The row is padded and the column absolute, so only the row is re-rendered.
    expect(to('$A01', DOWN)).toBe('$A2');
    expect(to('$A01', RIGHT)).toBe('$A01');
  });

  it('carries the column past Z the way Excel counts', () => {
    expect(to('Z1', RIGHT)).toBe('AA1');
    expect(to('AA1', { cols: -1, rows: 0 })).toBe('Z1');
  });

  it('moves a sheet-qualified reference and leaves the sheet alone', () => {
    expect(to('Summary!B2', OVER)).toBe('Summary!D5');
    expect(to("'Q3 Sales'!B2+1", OVER)).toBe("'Q3 Sales'!D5+1");
  });

  it('writes a reference it moves in upper case, which is what Excel stores', () => {
    expect(to('sum(a1:b2)', OVER)).toBe('sum(C4:D5)');
  });

  it('carries a leading `=` through, which a spec may still be written with', () => {
    expect(to('=A1*2', OVER)).toBe('=C4*2');
  });

  it('moves a whole-column and a whole-row range', () => {
    expect(to('SUM(A:A)', RIGHT)).toBe('SUM(B:B)');
    expect(to('SUM(1:10)', DOWN)).toBe('SUM(2:11)');
    expect(to('SUM($A:C)', RIGHT)).toBe('SUM($A:D)');
  });
});

describe('what a formula holds that is not a reference', () => {
  it('leaves a string alone, however much it looks like one', () => {
    expect(to('IF(A1="A1", "B2", C3)', OVER)).toBe('IF(C4="A1", "B2", E6)');
  });

  it('keeps a doubled quote inside a string as the escape it is', () => {
    expect(to('CONCAT("say ""A1""", B2)', OVER)).toBe('CONCAT("say ""A1""", D5)');
  });

  it('leaves a function name alone, even one that reads as a reference', () => {
    expect(to('LOG10(A1)', OVER)).toBe('LOG10(C4)');
    expect(to('LOG10 (A1)', OVER)).toBe('LOG10 (C4)');
  });

  it('leaves a table reference alone, and its nesting', () => {
    expect(to('SUM(Revenue[Revenue])', OVER)).toBe('SUM(Revenue[Revenue])');
    expect(to('SUM(Revenue[[#Headers],[A1]])', OVER)).toBe('SUM(Revenue[[#Headers],[A1]])');
  });

  it('leaves a bare name and a boolean alone', () => {
    expect(to('IF(TRUE, tax_rate, A1)', OVER)).toBe('IF(TRUE, tax_rate, C4)');
  });

  it('leaves a number that reads like a reference alone', () => {
    expect(to('1.5E+10*A1', OVER)).toBe('1.5E+10*C4');
  });

  it('leaves a number format alone, `$` and all', () => {
    expect(to('TEXT(A1, "$#,##0.00") & "!"', OVER)).toBe('TEXT(C4, "$#,##0.00") & "!"');
  });

  it('leaves an error value alone', () => {
    expect(to('IFERROR(A1, #REF!)', OVER)).toBe('IFERROR(C4, #REF!)');
  });

  it('keeps every operator and space exactly where it was', () => {
    expect(to('IF( A1 >= B2 , A1 & "x" , -A1 ^ 2 )', RIGHT)).toBe(
      'IF( B1 >= C2 , B1 & "x" , -B1 ^ 2 )',
    );
  });
});

describe('a formula that cannot be moved', () => {
  it('says which reference would leave the sheet', () => {
    expect(to('A1*2', { cols: -1, rows: 0 })).toBe('refused: `A1` would move off the sheet');
    expect(to('A1*2', { cols: 0, rows: -1 })).toBe('refused: `A1` would move off the sheet');
  });

  it('says so for a band that would leave it', () => {
    expect(to('SUM(A:B)', { cols: -1, rows: 0 })).toBe('refused: `A:B` would move off the sheet');
  });

  it('says so at the far edge as well', () => {
    expect(to('XFD1', RIGHT)).toBe('refused: `XFD1` would move off the sheet');
    expect(to('A1048576', DOWN)).toBe('refused: `A1048576` would move off the sheet');
  });

  it('refuses rather than guess where a quote never closes', () => {
    expect(to('CONCAT("A1, B2)', OVER)).toBe('refused: there is a `"` here that never closes');
  });

  it('refuses rather than guess where a bracket never closes', () => {
    expect(to('SUM(Revenue[Revenue)', OVER)).toBe('refused: there is a `[` here that never closes');
  });
});
