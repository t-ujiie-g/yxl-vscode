import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import { type A1Addr, type SheetName, sheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { computedAt, evaluate } from './evaluate';
import { univerEngine } from './univer';

function values(source: string) {
  const { doc } = load(parse(source, { file: 'spec.yxl.yaml' }));
  if (doc === null) throw new Error('did not load');
  return evaluate(compile(doc), univerEngine()).values;
}

function at(source: string, addr: string, sheet = 'Sales') {
  return values(source).get(computedAt(named(sheet), addr as A1Addr));
}

const SALES = 'sheets:\n  - name: Sales\n';

/** A sheet name, branded the way the compiler would have branded it. */
function named(name: string): SheetName {
  const read = sheetName(name);
  if (read === null) throw new Error(`not a sheet name: ${name}`);
  return read;
}

describe('a workbook computed', () => {
  it('adds up a range of written cells', () => {
    const spec = `${SALES}    cells:\n      B2: 2400000\n      B3: 1750000\n      B4: { formula: "SUM(B2:B3)" }\n`;
    expect(at(spec, 'B4')).toEqual({ kind: 'value', value: 4150000 });
  });

  it('computes a formula that reads another formula, which needs a second pass', () => {
    const spec = `${SALES}    cells:\n      A1: 2\n      A2: { formula: "A1*10" }\n      A3: { formula: "A2+5" }\n`;
    expect(at(spec, 'A3')).toEqual({ kind: 'value', value: 25 });
  });

  it('shifts a filled range the way Excel shifts it, per cell', () => {
    // The range holds `B2*0.05` as written at its anchor; C3 is one row down, so
    // it is `B3*0.05` there — the thing the preview refused to guess at.
    const spec = `${SALES}    cells:\n      B2: 100\n      B3: 200\n    formulas:\n      - at: C2:C3\n        formula: "B2*0.05"\n`;

    expect(at(spec, 'C2')).toEqual({ kind: 'value', value: 5 });
    expect(at(spec, 'C3')).toEqual({ kind: 'value', value: 10 });
  });

  it('reads a cell on another sheet by its name', () => {
    const spec = `sheets:\n  - name: Sales\n    cells:\n      A1: 40\n  - name: Notes\n    cells:\n      A1: { formula: "Sales!A1*2" }\n`;
    expect(at(spec, 'A1', 'Notes')).toEqual({ kind: 'value', value: 80 });
  });

  it("keeps Excel's own error text, which is what the workbook will show", () => {
    const spec = `${SALES}    cells:\n      A1: { formula: "1/0" }\n`;
    expect(at(spec, 'A1')).toEqual({ kind: 'error', error: '#DIV/0!' });
  });

  it('refuses a formula naming something it was not given, rather than answering anyway', () => {
    // A table reference and a workbook-defined name are both constructs this
    // editor does not model yet, and the engine has nothing behind either. It
    // would answer `#NAME?`, an `IFERROR` around it would answer `""`, and a
    // `SUM` over that would answer a number the workbook will not show.
    const spec = `${SALES}    cells:\n      A1: { formula: "IFERROR(INDEX(StoreMaster[name], 1), \\"\\")" }\n      A2: { formula: "B1*target_revenue" }\n`;

    expect(at(spec, 'A1')?.kind).toBe('unsupported');
    expect(at(spec, 'A2')?.kind).toBe('unsupported');
  });

  it('says what it could not resolve, so the gap is visible rather than silent', () => {
    const spec = `${SALES}    cells:\n      A1: { formula: "SUM(StoreMaster[amount])" }\n`;
    const { doc } = load(parse(spec, { file: 'spec.yxl.yaml' }));
    if (doc === null) throw new Error('did not load');

    expect(evaluate(compile(doc), univerEngine()).unknown).toEqual(['StoreMaster[amount]']);
  });

  it('doubts a whole sheet, because a total over cells it could not compute is wrong', () => {
    const spec = `${SALES}    cells:\n      B1: 1\n      B2: { formula: "SUM(B1)" }\n      B3: { formula: "target_revenue" }\n`;
    expect(at(spec, 'B2')?.kind).toBe('unsupported');
  });

  it('doubts a sheet that reads one it could not compute', () => {
    const spec = `sheets:\n  - name: Sales\n    cells:\n      A1: { formula: "target_revenue" }\n  - name: Notes\n    cells:\n      A1: { formula: "Sales!A1+1" }\n`;
    expect(at(spec, 'A1', 'Notes')?.kind).toBe('unsupported');
  });

  it('computes a sheet that reads only sheets it could compute', () => {
    const spec = `sheets:\n  - name: Sales\n    cells:\n      A1: 40\n  - name: Notes\n    cells:\n      A1: { formula: "Sales!A1*2" }\n`;
    expect(at(spec, 'A1', 'Notes')).toEqual({ kind: 'value', value: 80 });
  });

  it('computes text and logic, not only arithmetic', () => {
    const spec = `${SALES}    cells:\n      A1: { formula: "TEXT(0.085,\\"0.0%\\")" }\n      A2: { formula: "IF(2>1,\\"yes\\",\\"no\\")" }\n`;

    expect(at(spec, 'A1')).toEqual({ kind: 'value', value: '8.5%' });
    expect(at(spec, 'A2')).toEqual({ kind: 'value', value: 'yes' });
  });

  it('says a circular reference never settles rather than showing its last guess', () => {
    const spec = `${SALES}    cells:\n      A1: { formula: "A2+1" }\n      A2: { formula: "A1+1" }\n`;
    expect(at(spec, 'A1')?.kind).toBe('unsupported');
  });

  it('computes nothing at all for a sheet past the limit it was given', () => {
    // Half a total is a wrong total, so a sheet that does not fit is not
    // computed in part.
    const spec = `${SALES}    cells:\n      A1: { formula: "1+1" }\n      A2: { formula: "2+2" }\n`;
    const { doc } = load(parse(spec, { file: 'spec.yxl.yaml' }));
    if (doc === null) throw new Error('did not load');

    const done = evaluate(compile(doc), univerEngine(), 1);
    expect([done.stopped, done.values.size]).toEqual([true, 0]);
  });

  it('names a cell by its sheet, because two sheets have an A1', () => {
    expect(computedAt(named('Q3 data'), 'A1' as A1Addr)).toBe('Q3 data!A1');
  });

  it('reads a cell on a sheet whose name has to be quoted, as Excel writes it', () => {
    const spec = `sheets:\n  - name: Q3 data\n    cells:\n      A1: 7\n  - name: Sales\n    cells:\n      A1: { formula: "'Q3 data'!A1*3" }\n`;
    expect(at(spec, 'A1')).toEqual({ kind: 'value', value: 21 });
  });
});
