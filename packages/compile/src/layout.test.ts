import { type A1Addr, rangeOf } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { cellAt } from './compile';
import type { DataReader } from './ctx';
import { codes, files, holds, laidOut, said, sheet } from './harness';

describe('a layout reading its rows', () => {
  const CSV = 'code,name,region\nS1,Shinjuku,East\nS2,Umeda,West\n';

  it('matches CSV fields by name, whatever their order, and ignores the rest', () => {
    const source = laidOut(
      '      - at: A1\n        csv: s.csv\n        columns:\n          - { name: region }\n          - { name: label, field: name }\n',
    );
    const read = files({ 's.csv': CSV });

    expect(holds(source, 'A2', read)).toBe('West');
    expect(holds(source, 'B1', read)).toBe('Shinjuku');
  });

  it('matches JSON objects by key, and JSON arrays by position', () => {
    const named = laidOut(
      '      - at: A1\n        json: o.json\n        columns: [{ name: b }, { name: a }]\n',
    );
    const listed = laidOut(
      '      - at: A1\n        json: a.json\n        columns: [{ name: a }, { name: b }]\n',
    );
    const read = files({ 'o.json': '[{"a":1,"b":2}]', 'a.json': '[[1,2]]' });

    expect([holds(named, 'A1', read), holds(named, 'B1', read)]).toEqual([2, 1]);
    expect([holds(listed, 'A1', read), holds(listed, 'B1', read)]).toEqual([1, 2]);
  });

  it('reads a block column from its qualified name, or from `fields`', () => {
    const source = `defs:\n  blocks:\n    b:\n      columns: [{ name: x }, { name: y }]\n${laidOut(
      '      - at: A1\n        csv: s.csv\n        columns:\n          - { block: b, as: one, fields: { x: code } }\n',
    )}`;
    const read = files({ 's.csv': 'code,one.y\nS1,7\n' });

    expect([holds(source, 'A1', read), holds(source, 'B1', read)]).toEqual(['S1', 7]);
  });

  it('refuses a field the header row has not got', () => {
    const source = laidOut(
      '      - at: A1\n        csv: s.csv\n        columns: [{ name: missing }]\n',
    );
    expect(said(source, files({ 's.csv': CSV }))).toEqual([
      "`s.csv`: the CSV's header row has no field `missing` for column `missing`",
    ]);
  });

  it('refuses a positional row longer than the input columns', () => {
    const source = laidOut(
      '      - at: A1\n        values: [[1, 2]]\n        columns: [{ name: a }, { name: b, formula: "1" }]\n',
    );
    expect(codes(source)).toEqual([CODE.badLayout]);
  });

  it('reserves `rows`, never fewer than the data holds, and needs a count from somewhere', () => {
    const reserved = laidOut(
      '      - at: A1\n        rows: 3\n        values: [[1]]\n        columns: [{ name: a }, { name: b, formula: "{{a}}" }]\n',
    );
    expect(sheet(reserved).fills.map((one) => rangeOf(one.rect))).toEqual(['B1:B3']);

    expect(
      codes(
        laidOut(
          '      - at: A1\n        rows: 1\n        values: [[1], [2]]\n        columns: [{ name: a }]\n',
        ),
      ),
    ).toEqual([CODE.badLayout]);
    expect(codes(laidOut('      - at: A1\n        columns: [{ name: a }]\n'))).toEqual([
      CODE.badLayout,
    ]);
  });
});

describe('where a body cell was read from', () => {
  const origin = (source: string, at: string, read?: DataReader) =>
    cellAt(sheet(source, read), at as A1Addr)?.provenance.value;

  it('is its row and input column of `values:`', () => {
    const source = laidOut(
      '      - at: B2\n        values: [[x, 1], [y, 2]]\n        columns: [{ name: k }, { name: f, formula: "1" }, { name: n }]\n',
    );
    expect(origin(source, 'D3')).toMatchObject({
      kind: 'layout',
      from: { kind: 'inline', row: 1, col: 1 },
    });
  });

  it("is a CSV's own row and field, under its header, whatever order the columns take", () => {
    const source = laidOut(
      '      - at: A1\n        csv: s.csv\n        columns: [{ name: region }, { name: code }]\n',
    );
    const read = files({ 's.csv': 'code,name,region\nS1,Shinjuku,East\n' });
    expect(origin(source, 'A1', read)).toMatchObject({
      from: { kind: 'external', file: 's.csv', row: 1, col: 2 },
    });
  });
});
