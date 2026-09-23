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
