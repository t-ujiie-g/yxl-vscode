import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function loaded(body: string) {
  return load(parse(`sheets:\n  - name: S\n    tables:\n${body}`, { file: 'spec.yxl.yaml' }));
}

function first(body: string) {
  const one = loaded(body).doc?.sheets[0]?.tables[0];
  if (one === undefined) throw new Error('no table loaded');
  return one;
}

function codes(body: string): string[] {
  return loaded(body).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('a table', () => {
  it('reads the region, the name formulas call it, and the style', () => {
    const one = first(
      '      - at: A1:B4\n        name: Revenue\n        style: TableStyleMedium2\n',
    );
    expect(one.at).toBe('A1:B4');
    expect(one.name).toBe('Revenue');
    expect(one.style).toBe('TableStyleMedium2');
  });

  it('leaves the name and the style unsaid where the spec does', () => {
    const one = first('      - at: A1:B4\n');
    expect(one.name).toBeNull();
    expect(one.style).toBeNull();
  });

  it('bands the rows unless told otherwise, and nothing else', () => {
    const one = first('      - at: A1:B4\n');
    expect({ ...one, id: '', file: '', span: { start: 0, end: 0 }, at: '' }).toEqual({
      id: '',
      file: '',
      span: { start: 0, end: 0 },
      at: '',
      name: null,
      style: null,
      bandedRows: true,
      bandedColumns: false,
      firstColumn: false,
      lastColumn: false,
    });
  });

  it('reads each of the four Table Design toggles', () => {
    const one = first(
      '      - at: A1:B4\n        banded_rows: false\n        banded_columns: true\n' +
        '        first_column: true\n        last_column: true\n',
    );
    expect(one.bandedRows).toBe(false);
    expect(one.bandedColumns).toBe(true);
    expect(one.firstColumn).toBe(true);
    expect(one.lastColumn).toBe(true);
  });

  it('keeps a name a parameter will fill in, as written', () => {
    expect(first('      - at: A1:B4\n        name: "${team}_sales"\n').name).toBe('${team}_sales');
  });

  it('needs an `at`', () => {
    expect(codes('      - name: Revenue\n')).toEqual([CODE.missingKey]);
  });

  it('refuses an `at` that is not a range', () => {
    expect(codes('      - at: A1\n')).toEqual([CODE.badRange]);
  });

  it('refuses a toggle that is not a boolean, and a name that is not text', () => {
    expect(codes('      - at: A1:B4\n        banded_rows: yes please\n')).toEqual([
      CODE.notABoolean,
    ]);
    expect(codes('      - at: A1:B4\n        name: 3\n')).toEqual([CODE.notText]);
  });

  it('refuses a key the schema does not have', () => {
    expect(codes('      - at: A1:B4\n        totals_row: true\n')).toEqual([CODE.unknownKey]);
  });
});
