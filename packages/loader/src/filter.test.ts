import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

/** The spec with `filter:` written as given on its one sheet. */
function loaded(filter: string) {
  return load(parse(`sheets:\n  - name: S\n    filter: ${filter}\n`, { file: 'spec.yxl.yaml' }));
}

function read(filter: string) {
  return loaded(filter).doc?.sheets[0]?.filter;
}

describe("a sheet's filter", () => {
  it('reads the bare range, with no criteria', () => {
    expect(read('A1:D1')).toMatchObject({ at: 'A1:D1', columns: null });
  });

  it('reads the criteria saved in it, each by its column', () => {
    const filter =
      '\n      at: A1:D9\n      columns:\n        - { at: B, values: [North, 7] }\n        - { at: C, between: [1, 9] }';
    const one = read(filter);

    expect(one?.at).toBe('A1:D9');
    expect(one?.columns?.map((column) => [column.at, column.criterion])).toEqual([
      ['B', { kind: 'values', values: ['North', '7'] }],
      ['C', { kind: 'compare', compares: { kind: 'between', low: 1, high: 9 } }],
    ]);
  });

  it("reads a layout's name, whose columns its criteria may name", () => {
    const one = read(
      '\n      at: stores\n      columns:\n        - { at: branch, values: [東京] }',
    );
    expect(one?.at).toEqual({ kind: 'named', text: 'stores' });
    expect(one?.columns?.map((column) => column.at)).toEqual([{ kind: 'named', text: 'branch' }]);
  });

  it('reads a mapping with no `columns:` as one with no criteria', () => {
    expect(read('{ at: A1:D9 }')?.columns).toEqual([]);
  });

  it.each([
    ['without `at`', '{ columns: [] }', [CODE.missingKey]],
    ['with a key it does not have', '{ at: A1:D9, sort: B }', [CODE.unknownKey]],
    [
      'with a column that is a span',
      '{ at: A1:D9, columns: [{ at: B-C, equals: 1 }] }',
      [CODE.badColumn],
    ],
    [
      'with a column asking two things',
      '{ at: A1:D9, columns: [{ at: B, equals: 1, at_most: 2 }] }',
      [CODE.conflictingKeys],
    ],
    ['with a column asking nothing', '{ at: A1:D9, columns: [{ at: B }] }', [CODE.missingKey]],
    [
      'with a top-ten filter, which yxl refuses by name',
      '{ at: A1:D9, columns: [{ at: B, top: 10 }] }',
      [CODE.unknownKey],
    ],
    [
      'with a value that is neither text nor a whole number',
      '{ at: A1:D9, columns: [{ at: B, values: [1.5] }] }',
      [CODE.notText],
    ],
  ])('is refused %s', (_label, filter, expected) => {
    expect(loaded(filter).diagnostics.map((one) => one.code)).toEqual(expected);
  });
});
