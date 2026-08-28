import type { SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { files, tried } from './harness';
import { renameSheet } from './renaming';

/** The sheet renamed, through the checker — the file, or why not. */
function called(source: string, sheet: string, name: string): string {
  const { doc, grid, read } = files(source);
  const where = { sheet: sheet as SheetName, name };
  const intent = renameSheet({ doc, grid }, where, read);
  return tried(source, intent);
}

const TWO = `sheets:
  - name: Sales
    cells:
      A1: 1
  - name: Notes
    cells:
      A1: { formula: "Sales!A1*2" }
`;

describe('a sheet renamed', () => {
  it('is written under its new name', () => {
    expect(called(TWO, 'Sales', 'Revenue')).toContain('  - name: Revenue\n');
  });

  it('takes every formula that named it with it', () => {
    expect(called(TWO, 'Sales', 'Revenue')).toContain('A1: { formula: "Revenue!A1*2" }');
  });

  it('quotes the name where a formula needs it, and leaves the address alone', () => {
    expect(called(TWO, 'Sales', 'Q3 data')).toContain('formula: "\'Q3 data\'!A1*2"');
  });

  it('takes a `formulas:` range and a `defs.formulas` body with it', () => {
    const spec = `defs:
  formulas:
    rate: "Sales!B1"
sheets:
  - name: Sales
    cells:
      A1: 1
    formulas:
      - at: C1:C2
        formula: "Sales!A1*2"
`;
    const done = called(spec, 'Sales', 'Revenue');

    // Each keeps the quoting the file gave it: `set` writes a value into the
    // node that was there, and the node's style is the file's.
    expect(done).toContain('    rate: "Revenue!B1"\n');
    expect(done).toContain('        formula: "Revenue!A1*2"\n');
  });

  it('takes the `at:` of an override that named it', () => {
    const spec = `${TWO}overrides:\n  - at: Sales!A1\n    value: 9\n    reason: because\n`;

    expect(called(spec, 'Sales', 'Revenue')).toContain('  - at: Revenue!A1\n');
  });

  it('leaves the sheets and the formulas it is not about', () => {
    const done = called(TWO, 'Notes', 'Remarks');

    expect(done).toContain('  - name: Sales\n');
    expect(done).toContain('formula: "Sales!A1*2"');
    expect(done).toContain('  - name: Remarks\n');
  });
});

describe('what a rename will not do', () => {
  it('call a sheet what another sheet is called', () => {
    expect(called(TWO, 'Sales', 'Notes')).toBe('refused: there is already a sheet named `Notes`');
  });

  it('call it what it is called already', () => {
    expect(called(TWO, 'Sales', 'Sales')).toBe('refused: this sheet is called `Sales` already');
  });

  it('give it a name a sheet cannot have', () => {
    expect(called(TWO, 'Sales', 'A[B]')).toBe('refused: a sheet name cannot hold `[`');
  });

  it('rename a sheet that is not there', () => {
    expect(called(TWO, 'Nowhere', 'Revenue')).toBe('refused: there is no sheet named `Nowhere`');
  });
});
