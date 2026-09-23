import { parse } from '@yxl-vscode/cst';
import { reading } from '@yxl-vscode/diag';
import type { FooterEntry, Layout, LayoutColumn } from '@yxl-vscode/spec';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';
import { WORDS } from './text';

const english = reading('en', WORDS);

function loaded(source: string) {
  return load(parse(source, { file: 'spec.yxl.yaml' }));
}

function layouts(body: string): readonly Layout[] {
  return loaded(`sheets:\n  - name: Sales\n    layouts:\n${body}`).doc?.sheets[0]?.layouts ?? [];
}

function said(source: string): string[] {
  return loaded(source).diagnostics.map((one) => english(one.message));
}

function codes(body: string): string[] {
  const source = `sheets:\n  - name: Sales\n    layouts:\n${body}`;
  return loaded(source).diagnostics.map((one) => one.code);
}

const column = (entry: Layout['columns'][number] | undefined): LayoutColumn => {
  if (entry?.kind !== 'column') throw new Error('not a column');
  return entry;
};

describe('a layout', () => {
  it('reads its anchor, name, rows, source and columns', () => {
    const [layout] = layouts(
      '      - at: A2\n        name: stores\n        rows: 3\n        values:\n          - [a, 1]\n        columns:\n          - { name: item }\n          - { name: n, width: 12, format: "0" }\n',
    );

    expect(layout?.at).toBe('A2');
    expect(layout?.name).toBe('stores');
    expect(layout?.rows).toBe(3);
    expect(layout?.source).toEqual({ kind: 'inline', rows: [['a', 1]] });
    expect(layout?.columns.map((one) => (one.kind === 'column' ? one.name : one.block))).toEqual([
      'item',
      'n',
    ]);
    expect(column(layout?.columns[1]).width).toBe(12);
    expect(column(layout?.columns[1]).format).toBe('0');
  });

  it('reads a csv or a json path as its source', () => {
    const [csv] = layouts(
      '      - at: A1\n        csv: data/x.csv\n        columns: [{ name: a }]\n',
    );
    const [json] = layouts(
      '      - at: A1\n        json: data/x.json\n        columns: [{ name: a }]\n',
    );

    expect(csv?.source).toEqual({ kind: 'csv', path: 'data/x.csv' });
    expect(json?.source).toEqual({ kind: 'json', path: 'data/x.json', columns: null });
  });

  it('takes its rows from one source, reporting a second', () => {
    expect(
      codes(
        '      - at: A1\n        values: [[1]]\n        csv: x.csv\n        columns: [{ name: a }]\n',
      ),
    ).toEqual([CODE.conflictingKeys]);
  });

  it('reads a header as levels, a single cell as one, and null as a blank', () => {
    const [layout] = layouts(
      '      - at: A1\n        rows: 1\n        columns:\n          - { name: a, header: 部門 }\n          - { name: b, header: [売上, { value: 当年, style: key }] }\n          - { name: c, header: [null, 前年] }\n',
    );

    const levels = (at: number) =>
      column(layout?.columns[at]).header?.map((one) =>
        one === null ? null : one.value?.kind === 'literal' ? one.value.value : '?',
      );
    expect(levels(0)).toEqual(['部門']);
    expect(levels(1)).toEqual(['売上', '当年']);
    expect(levels(2)).toEqual([null, '前年']);
    expect(column(layout?.columns[1]).header?.[1]?.style).toEqual({ kind: 'ref', name: 'key' });
  });

  it('drops a leading `=` from a column formula, as every formula does', () => {
    const [layout] = layouts(
      '      - at: A1\n        rows: 1\n        columns: [{ name: a, formula: "={{b}}*2" }]\n',
    );
    expect(column(layout?.columns[0]).formula).toBe('{{b}}*2');
  });

  it('reads a column conditional without an `at`, and refuses one with', () => {
    const [layout] = layouts(
      '      - at: A1\n        rows: 1\n        columns:\n          - name: a\n            conditional:\n              - { cell: { less_than: 0 }, style: low }\n',
    );
    expect(column(layout?.columns[0]).conditional.map((one) => one.test)).toEqual([
      { kind: 'cell', compares: { kind: 'less_than', bound: 0 } },
    ]);

    expect(
      codes(
        '      - at: A1\n        rows: 1\n        columns:\n          - name: a\n            conditional:\n              - { at: A1:A2, cell: { less_than: 0 } }\n',
      ),
    ).toEqual([CODE.unknownKey]);
  });

  it('places a block by name, with its instance name, header and fields', () => {
    const [layout] = layouts(
      '      - at: A1\n        rows: 1\n        columns:\n          - { block: yoy, as: sales, header: 売上, fields: { cy: sales } }\n',
    );
    const [placed] = layout?.columns ?? [];

    expect(placed?.kind).toBe('block');
    if (placed?.kind !== 'block') return;
    expect(placed.block).toBe('yoy');
    expect(placed.as).toBe('sales');
    expect(placed.fields).toEqual([['cy', 'sales']]);
    expect(placed.header?.length).toBe(1);
  });

  it('refuses a column with a field and a formula', () => {
    expect(
      codes(
        '      - at: A1\n        rows: 1\n        columns: [{ name: a, field: x, formula: "1" }]\n',
      ),
    ).toEqual([CODE.conflictingKeys]);
  });

  it('refuses a column name `{{…}}` could not spell, and a layout name Excel would not take', () => {
    expect(codes('      - at: A1\n        rows: 1\n        columns: [{ name: 1st }]\n')).toEqual([
      CODE.badName,
    ]);
    expect(codes('      - at: A1\n        rows: 1\n        columns: [{ name: a.b }]\n')).toEqual([
      CODE.badName,
    ]);
    expect(
      codes('      - at: A1\n        name: B2\n        rows: 1\n        columns: [{ name: a }]\n'),
    ).toEqual([CODE.badName]);
  });

  it('refuses an empty header list, and a level that is itself a list', () => {
    expect(
      codes('      - at: A1\n        rows: 1\n        columns: [{ name: a, header: [] }]\n'),
    ).toEqual([CODE.missingKey]);
    expect(
      codes('      - at: A1\n        rows: 1\n        columns: [{ name: a, header: [[x]] }]\n'),
    ).toEqual([CODE.notAValue]);
  });

  it('needs an `at` and `columns`', () => {
    expect(codes('      - rows: 1\n        columns: [{ name: a }]\n')).toEqual([CODE.missingKey]);
    expect(codes('      - at: A1\n        rows: 1\n')).toEqual([CODE.missingKey]);
  });
});

describe('a footer', () => {
  function footer(body: string): readonly FooterEntry[] {
    const [layout] = layouts(
      `      - at: A1\n        rows: 1\n        columns: [{ name: a }, { name: b }, { name: c }]\n        footer:\n${body}`,
    );
    return layout?.footer ?? [];
  }

  it('reads a row by column, a total, a merge and the row style', () => {
    const [row] = footer(
      '          - row: { a: { value: 計, merge_to: b }, c: { total: sum } }\n            style: tot\n',
    );

    expect(row?.kind).toBe('row');
    if (row?.kind !== 'row') return;
    expect(row.style).toEqual({ kind: 'ref', name: 'tot' });
    expect(row.cells.map((one) => [one.column, one.mergeTo, one.total])).toEqual([
      ['a', 'b', null],
      ['c', null, 'sum'],
    ]);
    expect(row.cells[0]?.value).toEqual({ kind: 'literal', value: '計' });
  });

  it('reads a group with its order and the rows it repeats', () => {
    const [group] = footer(
      '          - by: a\n            order: [x, null, 2]\n            rows:\n              - row: { b: "{{a}}" }\n',
    );

    expect(group?.kind).toBe('group');
    if (group?.kind !== 'group') return;
    expect(group.by).toBe('a');
    expect(group.order).toEqual({ kind: 'listed', values: ['x', null, 2] });
    expect(group.rows).toHaveLength(1);
    expect(footer('          - by: a\n            rows: [{ row: { b: 1 } }]\n')[0]).toMatchObject({
      order: { kind: 'data' },
    });
  });

  it('refuses a total it does not know, an entry that is neither kind, and a group with no rows', () => {
    const body = (text: string) =>
      `      - at: A1\n        rows: 1\n        columns: [{ name: a }]\n        footer:\n${text}`;

    expect(codes(body('          - row: { a: { total: median } }\n'))).toEqual([
      CODE.unknownSpelling,
    ]);
    expect(codes(body('          - style: x\n'))).toEqual([CODE.missingKey]);
    expect(codes(body('          - by: a\n'))).toEqual([CODE.missingKey]);
  });
});

describe('a block definition', () => {
  it('reads each block as its columns', () => {
    const { doc } = loaded(
      'defs:\n  blocks:\n    yoy:\n      columns:\n        - { name: cy }\n        - { name: ratio, formula: "{{cy}}" }\n',
    );

    expect(doc?.defs.blocks.map((one) => [one.name, one.columns.map((each) => each.name)])).toEqual(
      [['yoy', ['cy', 'ratio']]],
    );
  });

  it('refuses a block placed inside a block', () => {
    expect(
      said('defs:\n  blocks:\n    yoy:\n      columns:\n        - { block: other }\n'),
    ).toEqual(['block `yoy` places another block; blocks do not nest']);
  });
});

describe('an anchor that follows a layout', () => {
  it('reads `below` and `gap`, a gap of one where none is written', () => {
    const doc = loaded(
      'sheets:\n  - name: S\n    charts:\n      - at: { below: stores, gap: 2 }\n        type: bar\n        series: [{ values: stores.a }]\n    data:\n      - at: { below: stores }\n        values: [[1]]\n',
    ).doc;

    expect(doc?.sheets[0]?.charts[0]?.at).toEqual({ kind: 'below', layout: 'stores', gap: 2 });
    expect(doc?.sheets[0]?.data[0]?.at).toEqual({ kind: 'below', layout: 'stores', gap: 1 });
  });

  it('refuses any key but `below` and `gap`', () => {
    const { diagnostics } = loaded(
      'sheets:\n  - name: S\n    data:\n      - at: { below: stores, after: 2 }\n        values: [[1]]\n',
    );
    expect(diagnostics.map((one) => one.code)).toEqual([CODE.unknownKey]);
  });
});

describe('an override found by meaning', () => {
  const override = (at: string) =>
    loaded(`sheets:\n  - name: S\noverrides:\n  - at: ${at}\n    value: 1\n`);

  it('reads the layout, the column, and `where` or `row`', () => {
    expect(
      override('{ layout: stores, column: cy, where: { store: 渋谷 } }').doc?.overrides[0]?.at,
    ).toEqual({
      kind: 'layout',
      layout: 'stores',
      column: 'cy',
      where: [['store', '渋谷']],
      row: null,
    });
    expect(override('{ layout: stores, column: cy, row: 2 }').doc?.overrides[0]?.at).toEqual({
      kind: 'layout',
      layout: 'stores',
      column: 'cy',
      where: null,
      row: 2,
    });
  });

  it('needs exactly one of `where` and `row`', () => {
    const codesOf = (at: string) => override(at).diagnostics.map((one) => one.code);
    expect(codesOf('{ layout: stores, column: cy }')).toEqual([CODE.conflictingKeys]);
    expect(codesOf('{ layout: stores, column: cy, row: 1, where: { a: 1 } }')).toEqual([
      CODE.conflictingKeys,
    ]);
  });
});

describe('a range written as a layout name', () => {
  it('is read as a name where a range would be, and kept for the compiler to place', () => {
    const doc = loaded(
      'sheets:\n  - name: S\n    tables:\n      - { at: stores }\n    validations:\n      - { at: stores.cy, list: [a] }\n    conditional:\n      - { at: stores.cy, cell: { less_than: 0 }, style: x }\n',
    ).doc;

    expect(doc?.sheets[0]?.tables[0]?.at).toEqual({ kind: 'named', text: 'stores' });
    expect(doc?.sheets[0]?.validations[0]?.at).toEqual({ kind: 'named', text: 'stores.cy' });
    expect(doc?.sheets[0]?.conditional[0]?.at).toEqual({ kind: 'named', text: 'stores.cy' });
  });

  it('is still refused where it is neither a range nor a name', () => {
    const { diagnostics } = loaded('sheets:\n  - name: S\n    tables:\n      - { at: "A1:" }\n');
    expect(diagnostics.map((one) => one.code)).toEqual([CODE.badRange]);
  });
});
