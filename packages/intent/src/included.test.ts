import type { A1Addr, Rect, SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { setValue } from './direct';
import { setFilled } from './fill';
import { chartOver, imageAt } from './float';
import { files } from './harness';
import { setLink } from './link';
import { setMerged } from './merge';
import { setNote } from './note';
import { tableOver } from './region';
import { candidates } from './resolve';
import { setSize } from './size';
import { asTable } from './table';
import { setValidation } from './validation';

const SHEET = 'Sales' as SheetName;

/** A spec whose sheet keeps one key in another file, and holds the rest here. */
function keeping(key: string, held: string, rest = ''): Record<string, string> {
  return {
    'spec.yxl.yaml': `sheets:\n  - name: Sales\n    ${key}:\n      $include: held.yxl.yaml\n${rest}`,
    'held.yxl.yaml': held,
  };
}

/** What a gesture came to, as a reader is told it. */
function why(intent: { kind: string; why?: string }): string {
  return intent.kind === 'refused' ? (intent.why ?? '') : `it wrote a file: ${intent.kind}`;
}

const CELLS = 'A1: Region\nB1: 2400000\nA2: APAC\nB2: 1\n';
const rect = (top: number, left: number, bottom = top, right = left): Rect => ({
  top,
  left,
  bottom,
  right,
});

describe('a sheet that keeps its cells in another file', () => {
  const of = keeping('cells', CELLS);

  it('says so where a cell nothing writes yet is typed into', () => {
    const { grid, read } = files(of);
    const intent = setValue(grid, { sheet: SHEET, at: 'C3' as A1Addr }, 'new', read);

    expect(why(intent)).toBe('`Sales` keeps its cells in another file');
  });

  it('offers no answer that would write one, since none of them can', () => {
    const { grid, read } = files(of);
    const answers = candidates(
      { grid, read, params: new Map() },
      { sheet: SHEET, at: 'C3' as A1Addr },
      'new',
    );

    expect(answers).toEqual([]);
  });

  it('leaves a cell that file does write editable, which is where it is written', () => {
    const { grid, read } = files(of);
    const intent = setValue(grid, { sheet: SHEET, at: 'A1' as A1Addr }, 'EMEA', read);

    expect(intent.kind).toBe('edit');
    expect(intent.kind === 'edit' && intent.file).toBe('held.yxl.yaml');
  });

  it('says so where a rectangle would be kept as a `data:` block instead', () => {
    const { doc, grid, read } = files(of);
    const intent = asTable({ doc, grid }, { sheet: SHEET, rect: rect(1, 1, 2, 2) }, read);

    expect(why(intent)).toBe('`Sales` keeps its cells in another file');
  });
});

describe('a sheet that keeps another key in another file', () => {
  it('says so of every gesture that would write under it', () => {
    const asks = keeping(
      'validations',
      '- at: A1:A9\n  list: [one, two]\n',
      '    cells:\n      A1: Draft\n',
    );
    const one = files(asks);
    expect(
      why(setValidation({ ...one }, { sheet: SHEET, rect: rect(1, 1), choices: ['x'] }, one.read)),
    ).toBe('`Sales` keeps its validations in another file');

    const tables = keeping(
      'tables',
      '- at: A1:B2\n',
      `    cells:\n      A1: Region\n      B1: Sold\n      A2: APAC\n      B2: 1\n`,
    );
    const two = files(tables);
    expect(
      why(tableOver({ ...two }, { sheet: SHEET, rect: rect(1, 1, 2, 2), on: true }, two.read)),
    ).toBe('`Sales` keeps its tables in another file');

    const charts = keeping(
      'charts',
      '- at: D1\n  type: bar\n  series:\n    - values: B1:B2\n',
      `    cells:\n      A1: APAC\n      A2: EMEA\n      B1: 1\n      B2: 2\n`,
    );
    const three = files(charts);
    expect(
      why(
        chartOver({ ...three }, { sheet: SHEET, rect: rect(1, 1, 2, 2), type: 'bar' }, three.read),
      ),
    ).toBe('`Sales` keeps its charts in another file');

    const images = keeping('images', '- at: D1\n  file: logo.png\n');
    const four = files(images);
    expect(
      why(imageAt({ ...four }, { sheet: SHEET, at: 'B2' as A1Addr, path: 'logo.png' }, four.read)),
    ).toBe('`Sales` keeps its images in another file');

    const merges = keeping('merges', '- A1:B1\n');
    const five = files(merges);
    expect(
      why(
        setMerged({ ...five }, { sheet: SHEET, rect: rect(3, 1, 3, 2), merged: true }, five.read),
      ),
    ).toBe('`Sales` keeps its merges in another file');
  });

  it('offers no answer where the answer would be a band, or a `formulas:` range', () => {
    const bands = keeping('columns', '- at: B\n  width: 18\n', '    cells:\n      A1: 1\n');
    const one = files(bands);
    expect(
      setSize({ ...one }, { sheet: SHEET, axis: 'column', first: 4, last: 4, size: 20 }, one.read),
    ).toEqual([]);

    const ranges = keeping(
      'formulas',
      '- at: D1:D2\n  formula: "A1"\n',
      '    cells:\n      B1: 1\n      B2: 2\n      C1: { formula: "B1*2" }\n',
    );
    const two = files(ranges);
    const answers = setFilled(
      { ...two },
      { sheet: SHEET, rect: rect(1, 3, 2, 3), axis: 'row' },
      two.read,
    );

    expect(answers.map((one) => one.id)).not.toContain('range');
  });

  it('says it of a note and a link in the words those keys are read in', () => {
    const notes = keeping('comments', 'A1: check stock\n', '    cells:\n      A1: Region\n');
    const one = files(notes);
    expect(
      why(setNote({ ...one }, { sheet: SHEET, at: 'B2' as A1Addr, text: 'hi' }, one.read)),
    ).toBe('`Sales` keeps its notes in another file');

    const links = keeping('links', 'A1: https://example.com\n', '    cells:\n      A1: Region\n');
    const two = files(links);
    const target = { kind: 'url', text: 'https://example.com/other' } as const;
    expect(why(setLink({ ...two }, { sheet: SHEET, at: 'B2' as A1Addr, target }, two.read))).toBe(
      '`Sales` keeps its links in another file',
    );
  });
});
