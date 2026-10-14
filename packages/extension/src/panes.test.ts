import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import { describe, expect, it } from 'vitest';
import { filtered, savedSaid } from './panes';

function filterOf(source: string) {
  const { doc } = load(parse(source, { file: 'spec.yxl.yaml' }));
  if (doc === null) throw new Error('did not load');
  return compile(doc).sheets[0]?.filter ?? null;
}

describe("a filter column's saved criterion, as its header's hover shows it", () => {
  it.each([
    [{ kind: 'values', values: ['Sent', '7'] }, 'Sent, 7'],
    [{ kind: 'compare', compares: { kind: 'at_least', bound: 1000 } }, '≥ 1000'],
    [{ kind: 'compare', compares: { kind: 'not_equals', bound: 'x*' } }, '≠ x*'],
    [{ kind: 'compare', compares: { kind: 'between', low: 1, high: 9 } }, '∈ [1, 9]'],
    [{ kind: 'compare', compares: { kind: 'not_between', low: 1, high: 9 } }, '∉ [1, 9]'],
  ] as const)('%o reads %s', (criterion, shows) => {
    expect(savedSaid(criterion)).toBe(shows);
  });
});

describe('a filter as the view draws it', () => {
  it('keeps the range, and says each saved criterion by column', () => {
    const spec =
      'sheets:\n  - name: S\n    filter:\n      at: A1:C9\n      columns:\n        - { at: B, less_than: 5 }\n';

    expect(filtered(filterOf(spec))).toEqual({
      top: 1,
      left: 1,
      bottom: 9,
      right: 3,
      saved: [{ col: 2, shows: '< 5' }],
    });
  });

  it('is nothing where the sheet has no filter', () => {
    expect(filtered(filterOf('sheets:\n  - name: S\n'))).toBeNull();
  });
});
