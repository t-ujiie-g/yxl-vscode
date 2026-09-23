import { type A1Addr, rangeOf } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { cellAt, styleAt } from './compile';
import { holds, laidOut, sheet } from './harness';
import { resolve } from './style';

describe('a layout drawn', () => {
  const YOY = laidOut(
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

  it("says which node each of its columns is written in, a block's shared", () => {
    const source = `defs:\n  blocks:\n    b:\n      columns: [{ name: v }]\n${laidOut(
      '      - at: A1\n        rows: 1\n        columns: [{ name: a }, { block: b, as: one }, { block: b, as: two }]\n',
    )}`;
    const [layout] = sheet(source).layouts;
    expect(layout?.columns.map((one) => [one.col, one.shared])).toEqual([
      [1, false],
      [2, true],
      [3, true],
    ]);
    expect(layout?.columns[1]?.node).toBe(layout?.columns[2]?.node);
  });

  it('writes its cells after an earlier key, where the later key wins', () => {
    const source = `sheets:\n  - name: S\n    cells:\n      A2: before\n    layouts:\n      - at: A1\n        values: [[x], [y]]\n        columns: [{ name: a }]\n`;
    expect(holds(source, 'A2')).toBe('y');
  });
});
