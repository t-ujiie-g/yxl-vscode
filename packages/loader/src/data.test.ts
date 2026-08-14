import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function loaded(body: string) {
  const source = `sheets:\n  - name: Sales\n    data:\n${body}`;
  return load(parse(source, { file: 'spec.yxl.yaml' }));
}

function blocks(body: string) {
  return loaded(body).doc?.sheets[0]?.data ?? [];
}

function codes(body: string): string[] {
  return loaded(body).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('a data block', () => {
  it("reads rows written in the spec, keeping each field's type", () => {
    const [block] = blocks(
      '      - at: A2\n        values:\n          - [APAC, 2400000]\n          - [EMEA, 1750000]\n',
    );
    expect(block?.at).toBe('A2');
    expect(block?.source).toEqual({
      kind: 'inline',
      rows: [
        ['APAC', 2400000],
        ['EMEA', 1750000],
      ],
    });
  });

  it('reads a null field as the blank it stands for', () => {
    const [block] = blocks('      - at: A2\n        values:\n          - [APAC, null, 3]\n');
    expect(block?.source).toEqual({ kind: 'inline', rows: [['APAC', null, 3]] });
  });

  it('leaves a short row short, since nothing is padded', () => {
    const [block] = blocks(
      '      - at: A2\n        values:\n          - [APAC]\n          - [EMEA, 1]\n',
    );
    expect(block?.source).toEqual({ kind: 'inline', rows: [['APAC'], ['EMEA', 1]] });
  });

  it('reads a CSV path', () => {
    expect(blocks('      - at: A8\n        csv: data/sales.csv\n')[0]?.source).toEqual({
      kind: 'csv',
      path: 'data/sales.csv',
    });
  });

  it('reads a JSON path with the fields to take', () => {
    const [block] = blocks(
      '      - at: D1\n        json: notes.json\n        columns: [label, count]\n',
    );
    expect(block?.source).toEqual({
      kind: 'json',
      path: 'notes.json',
      columns: ['label', 'count'],
    });
  });

  it('needs a source', () => {
    expect(codes('      - at: A2\n')).toEqual([CODE.missingKey]);
  });

  it('takes its rows from one place only', () => {
    expect(codes('      - at: A2\n        values: []\n        csv: sales.csv\n')).toEqual([
      CODE.conflictingKeys,
    ]);
  });

  it('reports `columns` beside a source whose field order is its own', () => {
    expect(codes('      - at: A2\n        csv: sales.csv\n        columns: [a]\n')).toEqual([
      CODE.conflictingKeys,
    ]);
  });

  it('needs an anchor', () => {
    expect(codes('      - values: []\n')).toEqual([CODE.missingKey]);
  });

  it('refuses an anchor that is a range rather than a cell', () => {
    expect(codes('      - at: A2:B3\n        values: []\n')).toEqual([CODE.badAddress]);
  });

  it('keeps a field it cannot read as a blank, so the fields after it stay put', () => {
    const [block] = blocks('      - at: A2\n        values:\n          - [APAC, [1, 2], 3]\n');
    expect(codes('      - at: A2\n        values:\n          - [APAC, [1, 2], 3]\n')).toEqual([
      CODE.notAValue,
    ]);
    expect(block?.source).toEqual({ kind: 'inline', rows: [['APAC', null, 3]] });
  });
});
