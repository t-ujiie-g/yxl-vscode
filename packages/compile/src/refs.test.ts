import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { codes, holds, laidOut, said } from './harness';

describe('column references', () => {
  it('reads a bare name inside a block as the instance column first', () => {
    const source = `defs:\n  blocks:\n    b:\n      columns: [{ name: v }, { name: w, formula: "{{v}}+{{rate}}" }]\n${laidOut(
      '      - at: A1\n        values: [[1, 2, 3]]\n        columns:\n          - { name: rate }\n          - { block: b, as: one }\n          - { block: b, as: two }\n',
    )}`;
    expect([holds(source, 'C1'), holds(source, 'E1')]).toEqual(['B1+A1', 'D1+A1']);
  });

  it('refuses a name that is not a column, and a `{{` never closed', () => {
    expect(
      said(
        laidOut(
          '      - at: A1\n        rows: 1\n        columns: [{ name: a, formula: "{{b}}" }]\n',
        ),
      ),
    ).toEqual(['`b` is not a column of this layout']);
    expect(
      said(
        laidOut(
          '      - at: A1\n        rows: 1\n        columns: [{ name: a, formula: "{{a" }]\n',
        ),
      ),
    ).toEqual(['a `{{` is never closed with `}}`']);
  });

  it('refuses an unknown block, and two instances or columns of one name', () => {
    expect(
      said(laidOut('      - at: A1\n        rows: 1\n        columns: [{ block: nope }]\n')),
    ).toEqual(['no block is declared as `nope` in `defs.blocks`']);
    expect(
      codes(
        laidOut('      - at: A1\n        rows: 1\n        columns: [{ name: a }, { name: a }]\n'),
      ),
    ).toEqual([CODE.badLayout]);
  });
});
