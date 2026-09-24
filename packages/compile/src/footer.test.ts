import { type A1Addr, rangeOf } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { styleAt } from './compile';
import { codes, holds, laidOut, said, sheet } from './harness';
import { resolve } from './style';

describe('a footer', () => {
  const GROUPED = laidOut(
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

  it('escapes the wildcards in a group value', () => {
    const source = laidOut(
      '      - at: A1\n        values: [["a*", 1], [b, 2]]\n        columns: [{ name: k }, { name: n }]\n        footer:\n          - by: k\n            order: asc\n            rows: [{ row: { n: { total: min } } }]\n',
    );
    expect([holds(source, 'B3'), holds(source, 'B4')]).toEqual([
      'MINIFS(B1:B2,A1:A2,"=a~*")',
      'MINIFS(B1:B2,A1:A2,"=b")',
    ]);
  });

  it('orders text by code point, whatever its length or its UTF-16 spelling (yxl#104)', () => {
    const source = laidOut(
      '      - at: A1\n        values: [["\\U00010000"], [b], ["\\uE000"], [aa], [a]]\n        columns: [{ name: k }]\n        footer:\n          - by: k\n            order: asc\n            rows: [{ row: { k: "{{k}}" } }]\n',
    );
    expect([6, 7, 8, 9, 10].map((row) => holds(source, `A${row}`))).toEqual([
      'a',
      'aa',
      'b',
      '\uE000',
      '\u{10000}',
    ]);
  });

  it('refuses a listed order that leaves a value out, or lists one twice', () => {
    const order = (listed: string) =>
      said(
        laidOut(
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
        laidOut(
          `      - at: A1\n        ${source}\n        columns: [{ name: k }, { name: f, formula: "1" }]\n        footer:\n          - by: ${column}\n            rows: [{ row: { k: 1 } }]\n`,
        ),
      );
    expect(by('f', 'values: [[x]]')).toEqual([CODE.unknownColumn]);
    expect(by('k', 'rows: 2')).toEqual([CODE.badLayout]);
  });

  it('refuses a merge leftward, and one over a cell the row also writes', () => {
    const row = (cells: string) =>
      said(
        laidOut(
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
    const source = laidOut(
      '      - at: A1\n        rows: 1\n        columns: [{ name: a }]\n        footer:\n          - row: { a: "{{a}}" }\n',
    );
    expect(said(source)).toEqual([
      '`{{a}}` in text can only spell the value of an enclosing `by` group',
    ]);
  });
});
