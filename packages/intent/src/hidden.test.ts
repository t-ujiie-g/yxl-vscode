import type { Axis } from '@yxl-vscode/spec';
import type { SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { files, wrote } from './harness';
import { setHidden } from './hidden';
import type { Candidate } from './resolve';

const SALES = 'sheets:\n  - name: Sales\n';
const CELLS = '    cells:\n      A1: 1\n';

/** The answers hiding — or showing — that run has. */
function offered(
  source: string,
  first: number,
  last: number,
  hidden: boolean,
  axis: Axis = 'column',
) {
  const { doc, grid, read } = files(source);
  const where = { sheet: 'Sales' as SheetName, axis, first, last, hidden };

  return setHidden({ doc, grid }, where, read);
}

/** The chosen answer, taken all the way through the checker. */
function taken(source: string, candidate: Candidate): string {
  const { intent } = candidate;
  return wrote(source, intent);
}

describe('columns nothing hides yet', () => {
  const BARE = `${SALES}${CELLS}`;

  it('are hidden by a band of their own, without asking', () => {
    const answers = offered(BARE, 2, 4, true);
    expect(answers.map((one) => [one.id, one.alone, one.what])).toEqual([
      ['ofItsOwn', true, 'Hide `B-D`'],
    ]);

    const [answer] = answers;
    if (answer === undefined) throw new Error('nothing was offered');
    expect(taken(BARE, answer)).toBe(
      `${BARE}    columns:\n      - at: B-D\n        hidden: true\n`,
    );
  });

  it('have nothing to show again, since nothing is hiding them', () => {
    expect(offered(BARE, 2, 4, false)).toEqual([]);
  });

  it('are hidden on the band already over exactly them', () => {
    const spec = `${SALES}    columns:\n      - at: B-D\n        width: 12\n${CELLS}`;
    const [answer] = offered(spec, 2, 4, true);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(answer.id).toBe('band');
    expect(taken(spec, answer)).toContain(
      '      - at: B-D\n        width: 12\n        hidden: true\n',
    );
  });
});

describe('columns a band of their own hides', () => {
  const HIDDEN = `${SALES}    columns:\n      - at: B-D\n        hidden: true\n${CELLS}`;

  it('are shown again by the key going, and the band with it', () => {
    const [answer] = offered(HIDDEN, 2, 4, false);
    if (answer === undefined) throw new Error('nothing was offered');

    expect([answer.id, answer.alone]).toEqual(['band', true]);
    expect(taken(HIDDEN, answer)).toBe(`${SALES}${CELLS}`);
  });

  it('keep the band where it says something else as well', () => {
    const sized = `${SALES}    columns:\n      - at: B-D\n        width: 12\n        hidden: true\n${CELLS}`;
    const [answer] = offered(sized, 2, 4, false);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(sized, answer)).toContain('      - at: B-D\n        width: 12\n');
    expect(taken(sized, answer)).not.toContain('hidden');
  });
});

describe('columns a wider band hides', () => {
  const WIDE = `${SALES}    columns:\n      - at: A-F\n        hidden: true\n${CELLS}`;

  it('are a question: the whole band, or the run alone', () => {
    const answers = offered(WIDE, 2, 4, false);
    expect(answers.map((one) => one.id)).toEqual(['band', 'apart']);
    expect(answers[0]?.what).toBe('Show the band over `A-F`, which is 6 columns');
    expect(answers[1]?.what).toBe('Split it so `B-D` alone is shown');
  });

  it('are shown alone by the split, with the rest left hidden', () => {
    const [, split] = offered(WIDE, 2, 4, false);
    if (split === undefined) throw new Error('nothing to split');

    expect(taken(WIDE, split)).toContain(
      '      - at: A\n        hidden: true\n      - at: B-D\n        hidden: false\n      - at: E-F\n        hidden: true\n',
    );
  });

  it('are hidden again by a band of their own, since they are hidden already', () => {
    const answers = offered(WIDE, 2, 4, true);
    expect(answers.map((one) => one.id)).toEqual(['ofItsOwn']);
  });
});

describe('rows', () => {
  it('hide under their own key, on the axis they belong to', () => {
    const spec = `${SALES}${CELLS}`;
    const [answer] = offered(spec, 3, 3, true, 'row');
    if (answer === undefined) throw new Error('nothing was offered');

    expect(answer.what).toBe('Hide `3`');
    expect(taken(spec, answer)).toContain('    rows:\n      - at: 3\n        hidden: true\n');
  });
});

describe('what hiding will not do', () => {
  it('says nothing about a sheet that is not there', () => {
    const { doc, grid, read } = files(`${SALES}${CELLS}`);
    const where = {
      sheet: 'Nowhere' as SheetName,
      axis: 'column' as Axis,
      first: 1,
      last: 1,
      hidden: true,
    };

    expect(setHidden({ doc, grid }, where, read)).toEqual([]);
  });

  it('says nothing about a run that is not one', () => {
    expect(offered(`${SALES}${CELLS}`, 4, 2, true)).toEqual([]);
  });
});
