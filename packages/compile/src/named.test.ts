import { reading } from '@yxl-vscode/diag';
import { type A1Addr, rangeOf } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { cellAt } from './compile';
import { grid, laidOut, said } from './harness';
import { WORDS } from './text';

const english = reading('en', WORDS);

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

  it('lists the defined names it makes: the table, and each column', () => {
    expect(grid(NAMED).names.map((one) => [one.name, one.sheet, rangeOf(one.rect)])).toEqual([
      ['stores', 'S', 'A1:B3'],
      ['stores.store', 'S', 'A2:A3'],
      ['stores.n', 'S', 'B2:B3'],
    ]);
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
    const source = laidOut(
      '      - at: A1\n        name: s\n        rows: 1\n        columns: [{ name: a }]\n      - at: C1\n        name: S\n        rows: 1\n        columns: [{ name: b }]\n',
    );
    expect(said(source)).toEqual(['`S` is already the name of another layout']);
  });

  it('refuses to follow a layout nobody named, or one declared after', () => {
    expect(
      said(
        laidOut(
          '      - at: { below: later }\n        rows: 1\n        columns: [{ name: a }]\n      - at: C1\n        name: later\n        rows: 1\n        columns: [{ name: b }]\n',
        ),
      ),
    ).toEqual(['no layout is named `later`']);
  });

  it('refuses an override whose `where` finds no row or two, and a row past the body', () => {
    const override = (at: string) =>
      said(
        `${laidOut('      - at: A1\n        name: t\n        values: [[x], [x]]\n        columns: [{ name: k }]\n')}overrides:\n  - at: ${at}\n    value: 1\n`,
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

describe("a sheet's own keys given as a layout", () => {
  const KEYED = (keys: string, layout = '') =>
    `sheets:\n  - name: S\n${keys}    layouts:\n      - at: B2\n        name: t\n        title: 表\n${layout}        values: [[東京, 1], [大阪, 2]]\n        columns: [{ name: k, header: [区分, 鍵] }, { name: v, header: [区分, 値] }]\n        footer:\n          - row: { k: 計, v: { total: sum } }\n`;
  const drawn = (keys: string, layout = '') => grid(KEYED(keys, layout)).sheets[0];

  it('freezes above the body, through as many of its columns as asked', () => {
    expect(drawn('    freeze: { layout: t }\n')?.freeze).toBe('A5');
    expect(drawn('    freeze: { layout: t, columns: 1 }\n')?.freeze).toBe('C5');
    expect(said(KEYED('    freeze: { layout: t, columns: 3 }\n'))).toEqual([
      '`columns` is 3, but the layout has 2',
    ]);
  });

  it('filters its table, and saves a criterion under a column it names', () => {
    const filter = drawn(
      '    filter: { at: t, columns: [{ at: v, equals: 1 }, { at: B, equals: 2 }] }\n',
    )?.filter;
    expect(filter && [filter.top, filter.bottom, filter.left, filter.right]).toEqual([4, 6, 2, 3]);
    expect(filter?.saved.map((one) => one.col)).toEqual([3, 2]);
  });

  it('prints all of it, and repeats its header rows atop every page', () => {
    const print = drawn('    print: { area: t, titles: t }\n')?.print;
    expect(print?.area).toEqual({ top: 2, bottom: 7, left: 2, right: 3 });
    expect(print?.titles).toEqual({ first: 3, last: 4 });
    expect(drawn('    print: { titles: 1-2 }\n')?.print?.titles).toEqual({ first: 1, last: 2 });
  });

  it('sizes the rows of each part a band names, and refuses a part it has not got', () => {
    const rows = drawn(
      '    rows:\n      - { at: { layout: t, part: title }, height: 30 }\n      - { at: { layout: t, part: footer }, height: 20 }\n',
    )?.rows;
    expect(rows?.map((one) => [one.first, one.last, one.size])).toEqual([
      [2, 2, 30],
      [7, 7, 20],
    ]);
    const untitled = `sheets:\n  - name: S\n    rows:\n      - { at: { layout: u, part: title }, height: 30 }\n    layouts:\n      - { at: A1, name: u, rows: 1, columns: [{ name: a }] }\n`;
    expect(said(untitled)).toEqual(['the layout `u` has no title rows']);
  });

  it('refuses a layout on another sheet, and a header to repeat that is not there', () => {
    const elsewhere = `sheets:\n  - name: S\n    layouts:\n      - { at: A1, name: u, rows: 1, columns: [{ name: a }] }\n  - name: T\n    print: { area: u, titles: u }\n`;
    expect(said(elsewhere)).toEqual([
      'the layout `u` is on the sheet `S`, not this one',
      'the layout `u` is on the sheet `S`, not this one',
    ]);
    const headless = `sheets:\n  - name: S\n    print: { titles: u }\n    layouts:\n      - { at: A1, name: u, rows: 1, columns: [{ name: a }] }\n`;
    expect(said(headless)).toEqual(['the layout `u` has no header rows to repeat']);
  });

  it("puts a note and a link on a cell found by meaning, on the layout's own sheet only", () => {
    const sheetOf = drawn(
      '    comments:\n      - { at: { layout: t, column: v, where: { k: 大阪 } }, text: 確認 }\n    links:\n      - { at: { layout: t, title: true }, url: "https://example.com" }\n',
    );
    expect([...(sheetOf?.notes.keys() ?? [])]).toEqual(['C6']);
    expect([...(sheetOf?.links.keys() ?? [])]).toEqual(['B2']);

    const away = `sheets:\n  - name: S\n    layouts:\n      - { at: A1, name: u, rows: 1, columns: [{ name: a }] }\n  - name: T\n    comments:\n      - { at: { layout: u, column: a, row: 1 }, text: x }\n`;
    expect(said(away)).toEqual(['the layout `u` is on the sheet `S`, not this one']);
  });
});

describe('a cell found by meaning, beyond the body', () => {
  const MEANT = (at: string) =>
    `sheets:\n  - name: S\n    layouts:\n      - at: A1\n        name: t\n        title: 表\n        values: [[東京, 1]]\n        columns: [{ name: k, header: [区分, 鍵] }, { name: v, header: [区分, 値] }]\n        footer:\n          - row: { k: { value: 計, merge_to: v } }\n          - row: { v: { total: sum } }\noverrides:\n  - at: ${at}\n    value: x\n`;
  const lands = (at: string) =>
    [...(grid(MEANT(at)).sheets[0]?.cells.values() ?? [])]
      .filter((one) => one.provenance.value.kind === 'override')
      .map((one) => one.at);

  it('finds a header row, a footer row, the last footer row, and the title', () => {
    expect(lands('{ layout: t, column: v, header: 2 }')).toEqual(['B3']);
    expect(lands('{ layout: t, column: v, footer: last }')).toEqual(['B6']);
    expect(lands('{ layout: t, column: k, footer: 1 }')).toEqual(['A5']);
    expect(lands('{ layout: t, title: true }')).toEqual(['A1']);
  });

  it('refuses a cell a merge covers, naming the merge, and a row past the part', () => {
    expect(said(MEANT('{ layout: t, column: v, header: 1 }'))).toEqual([
      'the cell lands inside the merged cells `A2:B2`; name their first cell',
    ]);
    expect(said(MEANT('{ layout: t, column: v, footer: 1 }'))).toEqual([
      'the cell lands inside the merged cells `A5:B5`; name their first cell',
    ]);
    expect(said(MEANT('{ layout: t, column: v, header: 3 }'))).toEqual([
      '`header` is 3, but the header has rows 1 to 2',
    ]);
  });
});
