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

  it('with `header_merge: false`, writes the same header cells and no merge', () => {
    const unmerged = YOY.replace('header_style:', 'header_merge: false\n        header_style:');
    expect(sheet(unmerged).merges).toEqual([]);
    expect(holds(unmerged, 'C2')).toBe('売上');
    expect(holds(unmerged, 'D2')).toBeNull();
    expect(resolve(styleAt(sheet(unmerged), 'D2' as A1Addr))['font.bold']).toBe(true);
    expect(resolve(styleAt(sheet(unmerged), 'B3' as A1Addr))['font.bold']).toBe(true);
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

describe("a layout's title", () => {
  const TITLED = (merge: string) =>
    laidOut(
      `      - at: A1\n        title: { value: 実績, style: { border: thin } }\n${merge}        rows: 1\n        columns: [{ name: a, header: A }, { name: b, header: B }, { name: c, header: C }]\n`,
    );
  const edges = (source: string, at: string) => {
    const said = resolve(styleAt(sheet(source), at as A1Addr));
    return [said['border.left.style'], said['border.right.style']].map((one) => one ?? null);
  };

  it('sits in the first row, merged across the layout, and moves the header down a row', () => {
    const source = TITLED('');
    expect([holds(source, 'A1'), holds(source, 'A2'), holds(source, 'A3')]).toEqual([
      '実績',
      'A',
      null,
    ]);
    expect(sheet(source).merges.map((one) => rangeOf(one.rect))).toEqual(['A1:C1']);
    expect(sheet(source).layouts[0]?.title).toEqual({ top: 1, bottom: 1, left: 1, right: 3 });
  });

  it('without merges keeps its outline: the edges between its cells go', () => {
    const source = TITLED('        header_merge: false\n');
    expect(sheet(source).merges).toEqual([]);
    expect([edges(source, 'A1'), edges(source, 'B1'), edges(source, 'C1')]).toEqual([
      ['thin', null],
      [null, null],
      [null, 'thin'],
    ]);
  });
});

describe("a layout's header styled row by row", () => {
  const STYLED = laidOut(
    '      - at: A1\n        header_style: [{ font: { bold: true } }, { font: { italic: true } }]\n        rows: 1\n        columns: [{ name: a, header: 部門 }, { name: b, header: [売上, 当年] }, { name: c, header: [売上, 前年] }]\n',
  );
  const look = (at: string) => {
    const said = resolve(styleAt(sheet(STYLED), at as A1Addr));
    return [said['font.bold'] ?? null, said['font.italic'] ?? null];
  };

  it('wears each row its own style, and a cell running down the style of the row it starts in', () => {
    expect([look('B1'), look('B2'), look('A1'), look('A2')]).toEqual([
      [true, null],
      [null, true],
      [true, null],
      [true, null],
    ]);
  });
});

describe("a layout's body look", () => {
  const BODY = laidOut(
    '      - at: A1\n        body_style: { fill: "EEEEEE" }\n        rows: 3\n        values: [[x, 1]]\n        columns:\n          - { name: k }\n          - { name: n, body_style: { format: "0.0" } }\n          - { name: f, formula: "{{n}}*2", body_style: { font: { bold: true } } }\n',
  );
  const said = (at: string) => resolve(styleAt(sheet(BODY), at as A1Addr));

  it('reaches every body cell, the blanks and the filled formulas, and stops where the body does', () => {
    expect([said('A1').fill, said('A3').fill, said('C3').fill, said('A4').fill]).toEqual([
      'EEEEEE',
      'EEEEEE',
      'EEEEEE',
      undefined,
    ]);
  });

  it("lays a column's own body look over the layout's", () => {
    expect([said('B2').format, said('C1')['font.bold'], said('A1').format]).toEqual([
      '0.0',
      true,
      undefined,
    ]);
  });
});

describe('a column that merges its repeats', () => {
  const MERGED = laidOut(
    '      - at: A1\n        values:\n          - [東京, 直営]\n          - [東京, 直営]\n          - [東京, FC]\n          - [大阪, 直営]\n          - [大阪, null]\n          - [大阪, null]\n        columns: [{ name: a, merge_equal: true }, { name: b, merge_equal: true }]\n',
  );

  it('merges each run down the body, cut where a column left of it changes, and never a blank', () => {
    expect(
      sheet(MERGED)
        .merges.map((one) => rangeOf(one.rect))
        .sort(),
    ).toEqual(['A1:A3', 'A4:A6', 'B1:B2']);
  });

  it('keeps every covered value, so a total over the column still sees it', () => {
    expect([holds(MERGED, 'A2'), holds(MERGED, 'A3')]).toEqual(['東京', '東京']);
  });
});

describe('a body look over rows the data leaves empty', () => {
  it('draws a bounded number of blanks, however many rows are reserved', () => {
    const huge = laidOut(
      '      - at: A1\n        body_style: { fill: "EEEEEE" }\n        rows: 1000000\n        values: [[x]]\n        columns: [{ name: a }, { name: b }]\n',
    );
    const drawn = sheet(huge);
    expect(drawn.cells.size).toBe(50_000);
    expect(resolve(styleAt(drawn, 'B2' as A1Addr)).fill).toBe('EEEEEE');
  });
});
