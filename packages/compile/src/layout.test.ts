import { reading } from '@yxl-vscode/diag';
import { type A1Addr, type FilePath, rangeOf } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { cellAt, styleAt } from './compile';
import type { DataReader } from './ctx';
import { cell, codes, grid, sheet } from './harness';
import { resolve } from './style';
import { WORDS } from './text';

const english = reading('en', WORDS);

/** A reader that holds these files and no others. */
function files(held: Record<string, string>): DataReader {
  return (_from, path) =>
    held[path] === undefined ? null : { file: path as FilePath, source: held[path] };
}

const on = (layout: string, rest = '') => `sheets:\n  - name: S\n    layouts:\n${layout}${rest}`;

function said(source: string, read?: DataReader): string[] {
  return grid(source, read).diagnostics.map((one) => english(one.message));
}

function holds(source: string, at: string, read?: DataReader) {
  const found = cell(source, at, read);
  return found === null ? null : (found.formula ?? found.value);
}

describe('a layout drawn', () => {
  const YOY = on(
    '      - at: B2\n        header_style: { font: { bold: true } }\n        values:\n          - [東, 120, 100]\n          - [西, 80]\n        columns:\n          - { name: item, header: 部門, width: 16 }\n          - { name: cy, header: [売上, 当年], format: "#,##0" }\n          - { name: py, header: [売上, 前年] }\n          - name: ratio\n            header: [売上, 比]\n            formula: \'IFERROR({{cy}}/{{py}}-1,"{{no}}")\'\n            conditional: [{ cell: { less_than: 0 }, style: { font: { italic: true } } }]\n',
  );

  it('puts the header levels from `at`, and the body under them', () => {
    expect(holds(YOY, 'B2')).toBe('部門');
    expect(holds(YOY, 'C2')).toBe('売上');
    expect(holds(YOY, 'C3')).toBe('当年');
    expect(holds(YOY, 'B4')).toBe('東');
    expect(holds(YOY, 'C5')).toBe(80);
    expect(holds(YOY, 'D5')).toBeNull();
  });

  it('merges a level across neighbours that agree, and a column down that runs out', () => {
    const merges = sheet(YOY).merges.map((one) => rangeOf(one.rect));
    expect(merges.sort()).toEqual(['B2:B3', 'C2:E2']);
  });

  it('fills a formula column down the body, `{{name}}` as that row, a quoted one left alone', () => {
    expect(holds(YOY, 'E4')).toBe('IFERROR(C4/D4-1,"{{no}}")');
    expect(holds(YOY, 'E5')).toBe('IFERROR(C5/D5-1,"{{no}}")');
    expect(sheet(YOY).fills.map((one) => rangeOf(one.rect))).toEqual(['E4:E5']);
  });

  it('gives each column its band, and each rule the column body', () => {
    const drawn = sheet(YOY);
    expect(drawn.columns.map((one) => [one.first, one.size])).toEqual([
      [2, 16],
      [3, null],
    ]);
    expect(drawn.conditional.map((one) => rangeOf(one.rect))).toEqual(['E4:E5']);
    expect(resolve(styleAt(drawn, 'C4' as A1Addr)).format).toBe('#,##0');
  });

  it('dresses every header cell, the blanks inside a merge too', () => {
    const drawn = sheet(YOY);
    expect(resolve(styleAt(drawn, 'D2' as A1Addr))['font.bold']).toBe(true);
    expect(resolve(styleAt(drawn, 'B3' as A1Addr))['font.bold']).toBe(true);
  });

  it('says a drawn cell came from the layout, naming what wrote it', () => {
    const drawn = sheet(YOY);
    expect(cellAt(drawn, 'B4' as A1Addr)?.provenance.value.kind).toBe('layout');
    expect(cellAt(drawn, 'E5' as A1Addr)?.provenance.value.kind).toBe('layout');
    expect(
      drawn.layouts.map((one) => [rangeOf(one.rect), one.header && rangeOf(one.header)]),
    ).toEqual([['B2:E5', 'B2:E3']]);
  });

  it('writes its cells after an earlier key, where the later key wins', () => {
    const source = `sheets:\n  - name: S\n    cells:\n      A2: before\n    layouts:\n      - at: A1\n        values: [[x], [y]]\n        columns: [{ name: a }]\n`;
    expect(holds(source, 'A2')).toBe('y');
  });
});

describe('a layout reading its rows', () => {
  const CSV = 'code,name,region\nS1,Shinjuku,East\nS2,Umeda,West\n';

  it('matches CSV fields by name, whatever their order, and ignores the rest', () => {
    const source = on(
      '      - at: A1\n        csv: s.csv\n        columns:\n          - { name: region }\n          - { name: label, field: name }\n',
    );
    const read = files({ 's.csv': CSV });

    expect(holds(source, 'A2', read)).toBe('West');
    expect(holds(source, 'B1', read)).toBe('Shinjuku');
  });

  it('matches JSON objects by key, and JSON arrays by position', () => {
    const named = on(
      '      - at: A1\n        json: o.json\n        columns: [{ name: b }, { name: a }]\n',
    );
    const listed = on(
      '      - at: A1\n        json: a.json\n        columns: [{ name: a }, { name: b }]\n',
    );
    const read = files({ 'o.json': '[{"a":1,"b":2}]', 'a.json': '[[1,2]]' });

    expect([holds(named, 'A1', read), holds(named, 'B1', read)]).toEqual([2, 1]);
    expect([holds(listed, 'A1', read), holds(listed, 'B1', read)]).toEqual([1, 2]);
  });

  it('reads a block column from its qualified name, or from `fields`', () => {
    const source = `defs:\n  blocks:\n    b:\n      columns: [{ name: x }, { name: y }]\n${on(
      '      - at: A1\n        csv: s.csv\n        columns:\n          - { block: b, as: one, fields: { x: code } }\n',
    )}`;
    const read = files({ 's.csv': 'code,one.y\nS1,7\n' });

    expect([holds(source, 'A1', read), holds(source, 'B1', read)]).toEqual(['S1', 7]);
  });

  it('refuses a field the header row has not got', () => {
    const source = on('      - at: A1\n        csv: s.csv\n        columns: [{ name: missing }]\n');
    expect(said(source, files({ 's.csv': CSV }))).toEqual([
      "`s.csv`: the CSV's header row has no field `missing` for column `missing`",
    ]);
  });

  it('refuses a positional row longer than the input columns', () => {
    const source = on(
      '      - at: A1\n        values: [[1, 2]]\n        columns: [{ name: a }, { name: b, formula: "1" }]\n',
    );
    expect(codes(source)).toEqual([CODE.badLayout]);
  });

  it('reserves `rows`, never fewer than the data holds, and needs a count from somewhere', () => {
    const reserved = on(
      '      - at: A1\n        rows: 3\n        values: [[1]]\n        columns: [{ name: a }, { name: b, formula: "{{a}}" }]\n',
    );
    expect(sheet(reserved).fills.map((one) => rangeOf(one.rect))).toEqual(['B1:B3']);

    expect(
      codes(
        on(
          '      - at: A1\n        rows: 1\n        values: [[1], [2]]\n        columns: [{ name: a }]\n',
        ),
      ),
    ).toEqual([CODE.badLayout]);
    expect(codes(on('      - at: A1\n        columns: [{ name: a }]\n'))).toEqual([CODE.badLayout]);
  });
});

describe('a footer', () => {
  const GROUPED = on(
    '      - at: A1\n        values:\n          - [東, 直営, 1]\n          - [西, FC, 2]\n          - [東, FC, 3]\n        columns: [{ name: area }, { name: kind }, { name: n }]\n        footer:\n          - by: area\n            rows:\n              - by: kind\n                order: [直営, FC]\n                rows:\n                  - row: { kind: "{{area}} {{kind}}", n: { total: sum } }\n              - row: { area: { value: "{{area}} 計", merge_to: kind }, n: { total: count } }\n                style: { font: { bold: true } }\n          - row: { area: 計, n: { total: average } }\n',
  );

  it('repeats a group per value, as the data lists them, and a listed order in full', () => {
    expect([4, 5, 6, 7, 8, 9].map((row) => holds(GROUPED, `B${row}`))).toEqual([
      '東 直営',
      '東 FC',
      null,
      '西 直営',
      '西 FC',
      null,
    ]);
    expect(holds(GROUPED, 'A6')).toBe('東 計');
  });

  it('totals within every enclosing group, and plainly outside them', () => {
    expect(holds(GROUPED, 'C4')).toBe('SUMIFS(C1:C3,A1:A3,"=東",B1:B3,"=直営")');
    expect(holds(GROUPED, 'C6')).toBe('COUNTIFS(C1:C3,"<>",A1:A3,"=東")');
    expect(holds(GROUPED, 'C10')).toBe('AVERAGE(C1:C3)');
  });

  it('merges a cell to the column it names, and wears the row style across it', () => {
    const drawn = sheet(GROUPED);
    expect(drawn.merges.map((one) => rangeOf(one.rect))).toEqual(['A6:B6', 'A9:B9']);
    expect(resolve(styleAt(drawn, 'C6' as A1Addr))['font.bold']).toBe(true);
    expect(drawn.layouts[0]?.footer && rangeOf(drawn.layouts[0].footer)).toBe('A4:C10');
  });

  it('escapes the wildcards in a group value, and orders shorter text first as yxl does', () => {
    const source = on(
      '      - at: A1\n        values: [["a*", 1], [b, 2]]\n        columns: [{ name: k }, { name: n }]\n        footer:\n          - by: k\n            order: asc\n            rows: [{ row: { n: { total: min } } }]\n',
    );
    expect([holds(source, 'B3'), holds(source, 'B4')]).toEqual([
      'MINIFS(B1:B2,A1:A2,"=b")',
      'MINIFS(B1:B2,A1:A2,"=a~*")',
    ]);
  });

  it('refuses a listed order that leaves a value out, or lists one twice', () => {
    const order = (listed: string) =>
      said(
        on(
          `      - at: A1\n        values: [[x], [y]]\n        columns: [{ name: k }]\n        footer:\n          - by: k\n            order: ${listed}\n            rows: [{ row: { k: 1 } }]\n`,
        ),
      );
    expect(order('[x]')).toEqual([
      '`order` leaves out `y`, which the data holds; its rows would be in no subtotal',
    ]);
    expect(order('[x, y, x]')).toEqual(['`order` lists `x` twice']);
  });

  it('refuses a group by a formula column, and a group with no data to take values from', () => {
    const by = (column: string, source: string) =>
      codes(
        on(
          `      - at: A1\n        ${source}\n        columns: [{ name: k }, { name: f, formula: "1" }]\n        footer:\n          - by: ${column}\n            rows: [{ row: { k: 1 } }]\n`,
        ),
      );
    expect(by('f', 'values: [[x]]')).toEqual([CODE.unknownColumn]);
    expect(by('k', 'rows: 2')).toEqual([CODE.badLayout]);
  });

  it('refuses a merge leftward, and one over a cell the row also writes', () => {
    const row = (cells: string) =>
      said(
        on(
          `      - at: A1\n        rows: 1\n        columns: [{ name: a }, { name: b }, { name: c }]\n        footer:\n          - row: ${cells}\n`,
        ),
      );
    expect(row('{ b: { value: x, merge_to: a } }')).toEqual([
      '`b` merges to `a`, which is not to its right',
    ]);
    expect(row('{ a: { value: x, merge_to: c }, b: 1 }')).toEqual([
      '`a` merges over `b`, which the row also writes',
    ]);
  });

  it('refuses text that spells a column outside a group', () => {
    const source = on(
      '      - at: A1\n        rows: 1\n        columns: [{ name: a }]\n        footer:\n          - row: { a: "{{a}}" }\n',
    );
    expect(said(source)).toEqual([
      '`{{a}}` in text can only spell the value of an enclosing `by` group',
    ]);
  });
});

describe('column references', () => {
  it('reads a bare name inside a block as the instance column first', () => {
    const source = `defs:\n  blocks:\n    b:\n      columns: [{ name: v }, { name: w, formula: "{{v}}+{{rate}}" }]\n${on(
      '      - at: A1\n        values: [[1, 2, 3]]\n        columns:\n          - { name: rate }\n          - { block: b, as: one }\n          - { block: b, as: two }\n',
    )}`;
    expect([holds(source, 'C1'), holds(source, 'E1')]).toEqual(['B1+A1', 'D1+A1']);
  });

  it('refuses a name that is not a column, and a `{{` never closed', () => {
    expect(
      said(
        on('      - at: A1\n        rows: 1\n        columns: [{ name: a, formula: "{{b}}" }]\n'),
      ),
    ).toEqual(['`b` is not a column of this layout']);
    expect(
      said(on('      - at: A1\n        rows: 1\n        columns: [{ name: a, formula: "{{a" }]\n')),
    ).toEqual(['a `{{` is never closed with `}}`']);
  });

  it('refuses an unknown block, and two instances or columns of one name', () => {
    expect(
      said(on('      - at: A1\n        rows: 1\n        columns: [{ block: nope }]\n')),
    ).toEqual(['no block is declared as `nope` in `defs.blocks`']);
    expect(
      codes(on('      - at: A1\n        rows: 1\n        columns: [{ name: a }, { name: a }]\n')),
    ).toEqual([CODE.badLayout]);
  });
});

describe('a named layout reached from outside', () => {
  const NAMED = `sheets:\n  - name: S\n    layouts:\n      - at: A1\n        name: stores\n        values: [[渋谷, 1], [新宿, 2]]\n        columns: [{ name: store, header: 店舗 }, { name: n, header: 数 }]\n      - at: { below: stores, gap: 2 }\n        rows: 1\n        columns: [{ name: after }]\n    tables:\n      - { at: stores }\n    validations:\n      - { at: stores.n, list: { from: stores.store } }\n    charts:\n      - at: { below: stores }\n        type: bar\n        series: [{ values: stores.n }]\n  - name: T\n    sparklines:\n      - { at: A1, data: stores.n }\n    tables:\n      - { at: stores }\noverrides:\n  - at: { layout: stores, column: n, where: { store: 新宿 } }\n    value: 9\n  - at: { layout: stores, column: store, row: 1 }\n    value: 原宿\n`;

  it('covers the table as its header row and body, and a column as its body', () => {
    const drawn = grid(NAMED).sheets[0];
    expect(drawn?.tables.map((one) => rangeOf(one.rect))).toEqual(['A1:B3']);
    expect(drawn?.validations.map((one) => rangeOf(one.rect))).toEqual(['B2:B3']);
    expect(drawn?.validations[0]?.asks).toEqual({
      kind: 'listFrom',
      sheet: 'S',
      rect: { top: 2, bottom: 3, left: 1, right: 1 },
    });
    expect(grid(NAMED).sheets[1]?.sparklines[0]?.data).toEqual({
      sheet: 'S',
      rect: { top: 2, bottom: 3, left: 2, right: 2 },
    });
  });

  it('anchors under the layout, a gap of one unless written', () => {
    const drawn = grid(NAMED).sheets[0];
    expect(drawn?.charts[0]?.at).toBe('A5');
    expect(drawn?.layouts[1] && rangeOf(drawn.layouts[1].rect)).toBe('A6:A6');
  });

  it('finds an override by meaning, and by body row', () => {
    const drawn = grid(NAMED).sheets[0];
    expect(drawn && cellAt(drawn, 'B3' as A1Addr)?.value).toBe(9);
    expect(drawn && cellAt(drawn, 'A2' as A1Addr)?.value).toBe('原宿');
  });

  it('refuses a covering range that names a layout on another sheet', () => {
    expect(grid(NAMED).diagnostics.map((one) => english(one.message))).toEqual([
      'the layout `stores` is on the sheet `S`, not this one',
    ]);
  });

  it('refuses a layout named twice, ignoring case', () => {
    const source = on(
      '      - at: A1\n        name: s\n        rows: 1\n        columns: [{ name: a }]\n      - at: C1\n        name: S\n        rows: 1\n        columns: [{ name: b }]\n',
    );
    expect(said(source)).toEqual(['`S` is already the name of another layout']);
  });

  it('refuses to follow a layout nobody named, or one declared after', () => {
    expect(
      said(
        on(
          '      - at: { below: later }\n        rows: 1\n        columns: [{ name: a }]\n      - at: C1\n        name: later\n        rows: 1\n        columns: [{ name: b }]\n',
        ),
      ),
    ).toEqual(['no layout is named `later`']);
  });

  it('refuses an override whose `where` finds no row or two, and a row past the body', () => {
    const override = (at: string) =>
      said(
        `${on('      - at: A1\n        name: t\n        values: [[x], [x]]\n        columns: [{ name: k }]\n')}overrides:\n  - at: ${at}\n    value: 1\n`,
      );
    expect(override('{ layout: t, column: k, where: { k: x } }')).toEqual([
      '`where` matches 2 rows of the data; it must find exactly one',
    ]);
    expect(override('{ layout: t, column: k, row: 3 }')).toEqual([
      '`row` is 3, but the body has rows 1 to 2',
    ]);
    expect(override('{ layout: u, column: k, row: 1 }')).toEqual(['no layout is named `u`']);
  });
});
