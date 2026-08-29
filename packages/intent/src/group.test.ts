import type { Axis } from '@yxl-vscode/spec';
import type { SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { setGroup } from './group';
import { english, files, wrote } from './harness';
import type { Candidate } from './resolve';

const SALES = 'sheets:\n  - name: Sales\n';
const CELLS = '    cells:\n      A1: 1\n';

/** The answers grouping that run — or taking it out — has. */
function offered(
  source: string,
  first: number,
  last: number,
  level: number,
  axis: Axis = 'column',
) {
  const { doc, grid, read } = files(source);
  const where = { sheet: 'Sales' as SheetName, axis, first, last, level };

  return setGroup({ doc, grid }, where, read);
}

/** The chosen answer, taken all the way through the checker. */
function taken(source: string, candidate: Candidate): string {
  const { intent } = candidate;
  return wrote(source, intent);
}

describe('columns nothing groups yet', () => {
  const BARE = `${SALES}${CELLS}`;

  it('are grouped by a band of their own, without asking', () => {
    const answers = offered(BARE, 2, 4, 1);
    expect(answers.map((one) => [one.id, one.alone, english(one.what)])).toEqual([
      ['ofItsOwn', true, 'Group `B-D` at level 1'],
    ]);

    const [answer] = answers;
    if (answer === undefined) throw new Error('nothing was offered');
    expect(taken(BARE, answer)).toBe(`${BARE}    columns:\n      - at: B-D\n        group: 1\n`);
  });

  it('have nothing to take out of an outline they are not in', () => {
    expect(offered(BARE, 2, 4, 0)).toEqual([]);
  });

  it('are grouped on the band already over exactly them', () => {
    const spec = `${SALES}    columns:\n      - at: B-D\n        width: 12\n${CELLS}`;
    const [answer] = offered(spec, 2, 4, 2);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(answer.id).toBe('band');
    expect(taken(spec, answer)).toContain('      - at: B-D\n        width: 12\n        group: 2\n');
  });

  it('are refused a level the schema does not have', () => {
    expect(offered(BARE, 2, 4, 8)).toEqual([]);
    expect(offered(BARE, 2, 4, -1)).toEqual([]);
  });
});

describe('columns a band of their own groups', () => {
  const GROUPED = `${SALES}    columns:\n      - at: B-D\n        group: 1\n${CELLS}`;

  it('come out of the outline by the key going, and the band with it', () => {
    const [answer] = offered(GROUPED, 2, 4, 0);
    if (answer === undefined) throw new Error('nothing was offered');

    expect([answer.id, answer.alone]).toEqual(['band', true]);
    expect(taken(GROUPED, answer)).toBe(`${SALES}${CELLS}`);
  });

  it('keep the band where a collapsed group is what it says', () => {
    const collapsed = `${SALES}    columns:\n      - at: B-D\n        group: 1\n        hidden: true\n${CELLS}`;
    const [answer] = offered(collapsed, 2, 4, 0);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(collapsed, answer)).toContain('      - at: B-D\n        hidden: true\n');
  });
});

describe('columns a wider band groups', () => {
  const WIDE = `${SALES}    columns:\n      - at: A-F\n        group: 1\n${CELLS}`;

  it('are a question: the whole band, or the run alone', () => {
    const answers = offered(WIDE, 2, 4, 0);
    expect(answers.map((one) => one.id)).toEqual(['band', 'apart']);
    expect(english(answers[0]?.what ?? '')).toBe(
      'Take `A-F` out of the outline, which is 6 columns',
    );
    expect(english(answers[1]?.what ?? '')).toBe('Split it so `B-D` alone is out');
  });

  it('are taken out alone by the split, with the rest left in', () => {
    const [, split] = offered(WIDE, 2, 4, 0);
    if (split === undefined) throw new Error('nothing to split');

    expect(taken(WIDE, split)).toContain(
      '      - at: A\n        group: 1\n      - at: B-D\n        group: 0\n      - at: E-F\n        group: 1\n',
    );
  });
});

describe('rows', () => {
  it('group under their own key, on the axis they belong to', () => {
    const spec = `${SALES}${CELLS}`;
    const [answer] = offered(spec, 3, 5, 1, 'row');
    if (answer === undefined) throw new Error('nothing was offered');

    expect(english(answer.what)).toBe('Group `3-5` at level 1');
    expect(taken(spec, answer)).toContain('    rows:\n      - at: 3-5\n        group: 1\n');
  });
});

describe('columns two bands group', () => {
  it('says level 0 rather than taking the key out, since the wider band would still group them', () => {
    const two = `${SALES}    columns:\n      - at: A-F\n        group: 1\n      - at: B-D\n        group: 2\n${CELLS}`;
    const [answer] = offered(two, 2, 4, 0);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(two, answer)).toContain('      - at: B-D\n        group: 0\n');
  });
});
