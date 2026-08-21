import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import type { Axis } from '@yxl-vscode/spec';
import { type FilePath, filePath, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { reading } from './direct';
import type { Candidate } from './resolve';
import { setSize } from './size';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);
const SALES = 'sheets:\n  - name: Sales\n';

function files(source: string) {
  const includes: IncludeReader = (_from, path) => (path === ROOT ? { file: ROOT, source } : null);

  const { doc } = load(parse(source, { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return { grid: compile(doc, { read: includes }), read: reading(() => source), includes };
}

/** The answers a drag has, over the column or row named. */
function offered(source: string, at: number, size: number, axis: Axis = 'column') {
  const { grid, read } = files(source);
  return setSize({ grid }, { sheet: 'Sales' as SheetName, axis, at, size }, read);
}

/** The chosen answer, taken all the way through the checker. */
function taken(source: string, candidate: Candidate): string {
  const { intent } = candidate;
  if (intent.kind !== 'edit') throw new Error('a file was not written');

  const { includes } = files(source);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);
  if (done.ok === false) {
    throw new Error(`the checker refused it: ${done.diagnostics[0]?.message ?? 'a surprise'}`);
  }

  return done.text;
}

const CELLS = '    cells:\n      A1: 1\n';

describe('a column nothing sizes', () => {
  it('is one answer, which a caller may take without asking', () => {
    const answers = offered(`${SALES}${CELLS}`, 4, 20);
    expect(answers.map((one) => [one.id, one.alone])).toEqual([['ofItsOwn', true]]);
  });

  it('is written as a band of its own, in the block form a spec writes bands in', () => {
    const spec = `${SALES}${CELLS}`;
    const [answer] = offered(spec, 4, 20);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain('    columns:\n      - at: D\n        width: 20\n');
  });

  it('joins the bands already there rather than starting again', () => {
    const spec = `${SALES}    columns:\n      - at: A\n        width: 12\n${CELLS}`;
    const [answer] = offered(spec, 4, 20);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toBe(
      `${SALES}    columns:\n      - at: A\n        width: 12\n      - at: D\n        width: 20\n${CELLS}`,
    );
  });

  it('is a row height in the key a row keeps it under', () => {
    const spec = `${SALES}${CELLS}`;
    const [answer] = offered(spec, 3, 28, 'row');
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain('    rows:\n      - at: 3\n        height: 28\n');
  });

  it('does not count a band that sizes nothing as sizing it', () => {
    const spec = `${SALES}    columns:\n      - at: D\n        style: { font: { bold: true } }\n${CELLS}`;
    expect(offered(spec, 4, 20).map((one) => one.id)).toEqual(['ofItsOwn']);
  });
});

describe('a column a band of its own sizes', () => {
  const ONE = `${SALES}    columns:\n      - at: D\n        width: 12\n${CELLS}`;

  it('is one answer, since the band is about that column and nothing else', () => {
    expect(offered(ONE, 4, 20).map((one) => [one.id, one.alone])).toEqual([['band', true]]);
  });

  it('changes the width it already had, and no other byte', () => {
    const [answer] = offered(ONE, 4, 20);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(ONE, answer)).toBe(ONE.replace('width: 12', 'width: 20'));
  });
});

describe('a column a band over several sizes', () => {
  const SPAN = `${SALES}    columns:\n      - at: D-F\n        width: 12\n        style: header\n${CELLS}`;

  it('is a question, since the drag was about one column and the band is about three', () => {
    expect(offered(SPAN, 5, 20).map((one) => [one.id, one.alone])).toEqual([
      ['band', false],
      ['apart', false],
    ]);
  });

  it('says how many the band answer would take with it', () => {
    const [answer] = offered(SPAN, 5, 20);
    expect(answer?.what).toBe('Change the band over `D-F`, which is 3 columns');
  });

  it('changes every column of the band where that is the answer taken', () => {
    const [answer] = offered(SPAN, 5, 20);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(SPAN, answer)).toContain('      - at: D-F\n        width: 20\n');
  });

  it('splits it into the runs either side, keeping every key the band had', () => {
    const [, answer] = offered(SPAN, 5, 20);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(SPAN, answer)).toBe(
      `${SALES}    columns:\n      - at: D\n        width: 12\n        style: header\n      - at: E\n        width: 20\n        style: header\n      - at: F\n        width: 12\n        style: header\n${CELLS}`,
    );
  });

  it('splits into two where the one dragged is at an end of the band', () => {
    const [, answer] = offered(SPAN, 4, 20);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(SPAN, answer)).toContain(
      '      - at: D\n        width: 20\n        style: header\n      - at: E-F\n        width: 12\n        style: header\n',
    );
  });

  it('splits a flow band as the flow mapping it was written as', () => {
    const spec = `${SALES}    columns:\n      - { at: D-F, width: 12 }\n${CELLS}`;
    const [, answer] = offered(spec, 5, 20);
    if (answer === undefined) throw new Error('nothing was offered');

    expect(taken(spec, answer)).toContain(
      '      - { at: D, width: 12 }\n      - { at: E, width: 20 }\n      - { at: F, width: 12 }\n',
    );
  });

  it('will not split a band whose `at` is a placeholder, which it would write over', () => {
    const spec = `params:\n  span: D-F\n${SALES}    columns:\n      - at: "\${span}"\n        width: 12\n${CELLS}`;
    expect(offered(spec, 5, 20).map((one) => one.id)).toEqual(['band']);
  });
});

describe('what a size will not do', () => {
  it('says nothing about a sheet that is not there', () => {
    const { grid, read } = files(`${SALES}${CELLS}`);
    const where = { sheet: 'Nowhere' as SheetName, axis: 'column' as Axis, at: 1, size: 12 };

    expect(setSize({ grid }, where, read)).toEqual([]);
  });

  it('says nothing about a column that is not one', () => {
    expect(offered(`${SALES}${CELLS}`, 0, 20)).toEqual([]);
  });
});
