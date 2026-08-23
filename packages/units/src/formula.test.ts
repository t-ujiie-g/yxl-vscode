import { describe, expect, it } from 'vitest';
import { type Line, moved, type Offset, renamed, shifted } from './formula';
import type { SheetName } from './name';

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

const SALES = 'Sales' as SheetName;

/** The formula as it reads once that line is drawn in `Sales`, or why it cannot be. */
function once(formula: string, of: Partial<Line> = {}, sheet = SALES): string {
  const done = shifted(formula, sheet, { sheet: SALES, axis: 'row', at: 5, by: 1, ...of });
  return done.ok ? done.formula : `refused: ${done.why}`;
}

describe('a formula once a row is inserted', () => {
  const said = (formula: string, at = 5, by = 1) => once(formula, { at, by });

  it('moves what stands at the line or past it, and leaves what stands above', () => {
    expect(said('A4+A5+A6')).toBe('A4+A6+A7');
  });

  it('moves an anchored reference too, since the cell it names has moved', () => {
    expect(said('$A$5+$A$4')).toBe('$A$6+$A$4');
  });

  it('leaves the other axis alone', () => {
    expect(once('A5+B5', { axis: 'column', at: 2 })).toBe('A5+C5');
  });

  it('moves a reference into that sheet from another, and only into that one', () => {
    expect(once('Sales!A5+Notes!A5', {}, 'Notes' as SheetName)).toBe('Sales!A6+Notes!A5');
  });

  it('leaves a formula in another sheet that names no sheet at all', () => {
    expect(once('A5', {}, 'Notes' as SheetName)).toBe('A5');
  });

  it('reads a quoted sheet name as the sheet it names', () => {
    expect(once("'Sales'!A5", {}, 'Notes' as SheetName)).toBe("'Sales'!A6");
  });

  it('moves both ends of a whole-row range that the line reaches', () => {
    expect(said('SUM(4:6)')).toBe('SUM(4:7)');
    expect(said('SUM(A:C)')).toBe('SUM(A:C)');
  });

  it('says nothing about what is not a reference', () => {
    // `MAX5` would be a reference: a name has to say it is not one.
    expect(said('CONCAT("A5",LOG10(5),Rate_5)')).toBe('CONCAT("A5",LOG10(5),Rate_5)');
  });
});

describe('a formula once a row is taken away', () => {
  const said = (formula: string, at = 5, by = -1) => once(formula, { at, by });

  it('closes the gap under what was taken', () => {
    expect(said('A4+A6')).toBe('A4+A5');
  });

  it('refuses a reference into what is going, rather than writing `#REF!`', () => {
    expect(said('A4+A5')).toBe('refused: `A5` names a row this would take away');
  });

  it('refuses a range end inside it for the same reason', () => {
    expect(said('SUM(5:9)')).toBe('refused: `5:9` names a row this would take away');
  });

  it('takes a run of rows away at once', () => {
    expect(said('A4+A9', 5, -3)).toBe('A4+A6');
    expect(said('A7', 5, -3)).toBe('refused: `A7` names a row this would take away');
  });
});

describe('a formula once a sheet is renamed', () => {
  const to = (formula: string, from = 'Sales', name = 'Revenue') => {
    const done = renamed(formula, from as SheetName, name as SheetName);
    return done.ok ? done.formula : `refused: ${done.why}`;
  };

  it('names the sheet its new name, and leaves the address alone', () => {
    expect(to('Sales!A1+Sales!B2')).toBe('Revenue!A1+Revenue!B2');
  });

  it('leaves the sheets it is not about, and words that are not sheets', () => {
    expect(to('Sales!A1+Notes!A1+A1+SUM(Sales!A1:A2)')).toBe(
      'Revenue!A1+Notes!A1+A1+SUM(Revenue!A1:A2)',
    );
  });

  it('reads a quoted name, and writes one where the new name needs it', () => {
    expect(to("'Q3 data'!A1", 'Q3 data', 'Q4 data')).toBe("'Q4 data'!A1");
    expect(to("'Q3 data'!A1", 'Q3 data', 'Q4')).toBe('Q4!A1');
    expect(to('Sales!A1', 'Sales', 'Q4 data')).toBe("'Q4 data'!A1");
  });

  it('doubles an apostrophe in a name that has one, as Excel writes it', () => {
    expect(to('Sales!A1', 'Sales', "Bob's")).toBe("'Bob''s'!A1");
  });

  it('leaves a name inside a string alone, since that is text', () => {
    expect(to('CONCAT("Sales!A1",Sales!A1)')).toBe('CONCAT("Sales!A1",Revenue!A1)');
  });

  it('does nothing where the name has not changed', () => {
    expect(to('Sales!A1', 'Sales', 'Sales')).toBe('Sales!A1');
  });
});
