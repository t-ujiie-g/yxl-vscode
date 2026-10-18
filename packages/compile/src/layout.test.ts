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

  it('refuses a `header_merge` with no header to merge', () => {
    const source = laidOut(
      '      - at: A1\n        header_merge: false\n        rows: 1\n        columns: [{ name: a }]\n',
    );
    expect(said(source)).toEqual([
      'the layout has a `header_merge`, but no `title` or column `header` to merge',
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

describe("a layout column's type", () => {
  const typed = (columns: string, csv: string) =>
    [
      laidOut(`      - at: A1\n        csv: t.csv\n        columns: ${columns}\n`),
      files({ 't.csv': csv }),
    ] as const;

  it('reads a CSV field as written: `007` stays text, and `true` a boolean only where asked', () => {
    const [source, read] = typed(
      '[{ name: code, type: text }, { name: n, type: number }, { name: ok, type: bool }]',
      'code,n,ok\n007,12,true\n',
    );
    expect([
      holds(source, 'A1', read),
      holds(source, 'B1', read),
      holds(source, 'C1', read),
    ]).toEqual(['007', 12, true]);
  });

  it('draws a date or a duration as its serial, under the format it reads unless the column sets one', () => {
    const [source, read] = typed(
      '[{ name: d, type: date }, { name: t, type: duration }, { name: f, type: date, format: "d/m" }]',
      'd,t,f\n2026-04-01,1:30,2026-04-01\n',
    );
    const drawn = sheet(source, read);
    const at = (addr: string) => cellAt(drawn, addr as A1Addr);
    expect([at('A1')?.value, at('A1')?.type, at('A1')?.format]).toEqual([
      46113,
      'date',
      'yyyy-mm-dd',
    ]);
    expect([at('B1')?.value, at('B1')?.format]).toEqual([1.5 / 24, '[h]:mm:ss']);
    expect(at('C1')?.format).toBeNull();
  });

  it('refuses a field the type cannot read, naming its row and column', () => {
    const [source, read] = typed('[{ name: n, type: number }]', 'n\n1\nabc\n');
    expect(said(source, read)).toEqual(['row 2 of column `n` cannot be read as `number`: `abc`']);
  });
});

describe('what a layout needs data for', () => {
  it('refuses `merge_equal` and `page_break_on` with no data to read', () => {
    expect(
      said(
        laidOut(
          '      - at: A1\n        rows: 2\n        columns: [{ name: a, merge_equal: true }]\n',
        ),
      ),
    ).toEqual(['column `a` has `merge_equal`, but the layout reads no data to merge']);
    expect(
      said(
        laidOut(
          '      - at: A1\n        rows: 2\n        page_break_on: a\n        columns: [{ name: a }]\n',
        ),
      ),
    ).toEqual(['the layout has a `page_break_on`, but reads no data to break on']);
  });

  it('breaks pages above each body row whose value differs from the row above', () => {
    const source = laidOut(
      '      - at: A2\n        page_break_on: a\n        values: [[x], [x], [y], [z]]\n        columns: [{ name: a, header: A }]\n',
    );
    expect(sheet(source).print?.breaks).toEqual([
      { col: 1, row: 5 },
      { col: 1, row: 6 },
    ]);
    expect(
      said(
        laidOut(
          '      - at: A1\n        values: [[x]]\n        page_break_on: b\n        columns: [{ name: a }, { name: b, formula: "1" }]\n',
        ),
      ),
    ).toEqual(['`b` must be a column the data fills (one without a `formula`)']);
  });

  it('refuses a header style list longer than the header is deep', () => {
    expect(
      said(
        laidOut(
          '      - at: A1\n        header_style: [x, y]\n        rows: 1\n        columns: [{ name: a, header: A }]\n',
        ),
      ),
    ).toContain('`header_style` lists 2 styles, but the header is 1 rows deep');
  });
});
