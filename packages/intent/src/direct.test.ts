import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type A1Addr, type FilePath, filePath, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { excepting, type Intent, reading, setFormula, setValue, type Text } from './direct';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);

/** A spec of one or more files, read the way the extension reads one. */
function files(sources: Record<string, string>) {
  const text: Text = (file) => sources[file] ?? null;
  const includes: IncludeReader = (_from, path) => {
    const file = filePath(path);
    return file === null || sources[path] === undefined ? null : { file, source: sources[path] };
  };

  const source = sources[ROOT] ?? '';
  const { doc } = load(parse(source, { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return { grid: compile(doc, { read: includes }), read: reading(text), includes, source };
}

function edited(sources: Record<string, string>, intent: Intent): string {
  if (intent.kind === 'refused') throw new Error(`refused: ${intent.why}`);
  if (intent.kind !== 'edit') throw new Error('a file was written, not a spec');

  const { includes } = files(sources);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(sources[intent.file] ?? '', intent.patch, intent.expects, ctx);
  if (done.ok === false) throw new Error('the checker refused it');

  return done.text;
}

function at(address: string) {
  return { sheet: 'Sales' as SheetName, at: address as A1Addr };
}

const SALES = 'sheets:\n  - name: Sales\n';

describe('typing a value into a cell', () => {
  it('writes it where the spec wrote the cell', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      A1: Region\n      B1: 2400000\n` };
    const { grid, read } = files(sources);

    expect(edited(sources, setValue(grid, at('B1'), 2500000, read))).toContain('B1: 2500000');
  });

  it('writes under the `value:` key when the cell was written the long way', () => {
    const cell = 'A1: { value: 0.085, format: "0.0%" }';
    const sources = { [ROOT]: `${SALES}    cells:\n      ${cell}\n` };
    const { grid, read } = files(sources);
    const after = edited(sources, setValue(grid, at('A1'), 0.09, read));

    expect(after).toContain('A1: { value: 0.09, format: "0.0%" }');
  });

  it('writes into the file the cell is in, not the one the spec was opened as', () => {
    const sources = {
      [ROOT]: 'sheets:\n  - $include: sales.yaml\n',
      'sales.yaml': 'name: Sales\ncells:\n  A1: Region\n',
    };
    const { grid, read } = files(sources);
    const intent = setValue(grid, at('A1'), 'Area', read);

    expect(intent.kind === 'edit' && intent.file).toBe('sales.yaml');
    expect(edited(sources, intent)).toBe('name: Sales\ncells:\n  A1: Area\n');
  });

  it('writes one field of an inline `data:` block', () => {
    const block = `${SALES}    data:\n      - at: A1\n        values:\n          - [Region, Revenue]\n          - [APAC, 2400000]\n`;
    const sources = { [ROOT]: block };
    const { grid, read } = files(sources);

    expect(edited(sources, setValue(grid, at('B2'), 2500000, read))).toContain('[APAC, 2500000]');
  });

  it('keeps the quoting the spec chose', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      A1: "007"\n` };
    const { grid, read } = files(sources);

    expect(edited(sources, setValue(grid, at('A1'), '008', read))).toContain('A1: "008"');
  });
});

describe('what typing into a cell will not do', () => {
  function why(sources: Record<string, string>, address: string): string {
    const { grid, read } = files(sources);
    const intent = setValue(grid, at(address), 'x', read);
    return intent.kind === 'refused' ? intent.why : '';
  }

  it('refuses a value that came from a definition, and says which', () => {
    const spec = `${SALES}    cells:\n      A1: { $ref: rate }\ndefs:\n  values:\n    rate: 0.085\n`;
    expect(why({ [ROOT]: spec }, 'A1')).toContain('reads a definition');
  });

  it('refuses a value that came from a file beside the spec', () => {
    const spec = `${SALES}    data:\n      - at: A1\n        csv: sales.csv\n`;
    const sources = { [ROOT]: spec, 'sales.csv': 'APAC,1\n' };
    const { grid, read } = files(sources);
    const intent = setValue(grid, at('A1'), 'x', read);

    expect(intent.kind === 'refused' && intent.why).toContain('sales.csv');
  });

  it('refuses a cell a `formulas:` range fills, naming the range that fills it', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;
    const said = why({ [ROOT]: spec }, 'B2');

    expect(said).toContain('filled by the range anchored at `B1`');
    expect(said).toContain('one formula for every cell it covers');
  });

  it('says what the anchor is, at the anchor, rather than sending the reader to it', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;
    expect(why({ [ROOT]: spec }, 'B1')).toContain('changing it changes every cell');
  });

  it('refuses a cell that holds a parameter', () => {
    const spec = `params:\n  region: APAC\n${SALES}    cells:\n      A1: "\${region}"\n`;
    expect(why({ [ROOT]: spec }, 'A1')).toContain('parameter');
  });

  it('writes a value into a cell that was written for its format alone', () => {
    // `docs/spec.md` §3: a cell may be a number format and nothing else. It is
    // still a cell, and there is one place a value goes in it.
    const spec = `${SALES}    cells:\n      B4: { format: "0.0%" }\n`;
    const sources = { [ROOT]: spec };
    const { grid, read } = files(sources);

    expect(edited(sources, setValue(grid, at('B4'), 0.01, read))).toBe(
      `${SALES}    cells:\n      B4: { value: 0.01, format: "0.0%" }\n`,
    );
  });

  it('writes a value into a cell that was written for its style alone', () => {
    const spec = `${SALES}    cells:\n      B4:\n        style: header\n`;
    const sources = { [ROOT]: spec };
    const { grid, read } = files(sources);

    expect(edited(sources, setValue(grid, at('B4'), 'Total', read))).toBe(
      `${SALES}    cells:\n      B4:\n        value: Total\n        style: header\n`,
    );
  });

  it('refuses an address nothing is written at', () => {
    expect(why({ [ROOT]: `${SALES}    cells:\n      A1: 1\n` }, 'Z9')).toContain('nothing writes');
  });
});

describe('typing a formula into a cell', () => {
  it('writes it where the formula is written', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      B1: { formula: "SUM(A1:A2)" }\n` };
    const { grid, read } = files(sources);

    expect(edited(sources, setFormula(grid, at('B1'), 'SUM(A1:A3)', read))).toContain(
      'formula: "SUM(A1:A3)"',
    );
  });

  it('refuses to type a value over a cell written as a formula, and says what to do', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      B1: { formula: "SUM(A1:A2)" }\n` };
    const { grid, read } = files(sources);
    const intent = setValue(grid, at('B1'), 5, read);

    expect(intent.kind === 'refused' && intent.why).toContain('holds a formula');
  });

  it('refuses it even where a cached result sits beside the formula', () => {
    // `value:` next to `formula:` is what Excel last computed, not the cell's
    // own value. Typing a number over it leaves the formula in place and the
    // workbook showing something else until Excel recomputes.
    const cell = 'B1: { formula: "SUM(A1:A2)", value: 4150000 }';
    const sources = { [ROOT]: `${SALES}    cells:\n      ${cell}\n` };
    const { grid, read } = files(sources);
    const intent = setValue(grid, at('B1'), 5, read);

    expect(intent.kind === 'refused' && intent.why).toContain('holds a formula');
  });

  it('writes into a formula the spec folded across lines, keeping the fold', () => {
    // `summary.yaml` writes its formulas this way, so this is a real spec's
    // spelling: the `>-` and its chomping sit outside the body and stay put.
    const folded = `${SALES}    cells:\n      B1:\n        formula: >-\n          IF(A1="", "",\n          SUM(A1:A2))\n`;
    const sources = { [ROOT]: folded };
    const { grid, read } = files(sources);
    const after = edited(sources, setFormula(grid, at('B1'), 'SUM(A1:A2)*2', read));

    expect(after).toBe(
      `${SALES}    cells:\n      B1:\n        formula: >-\n          SUM(A1:A2)*2\n`,
    );
  });

  it('refuses a cell that holds a value rather than a formula', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      A1: 1\n` };
    const { grid, read } = files(sources);
    const intent = setFormula(grid, at('A1'), 'SUM(B1:B2)', read);

    expect(intent.kind === 'refused' && intent.why).toContain('holds no formula');
  });
});

describe('the files an edit reads', () => {
  const SPEC = `${SALES}    cells:\n      A1: APAC\n`;

  it('parses a file once, however many times its tree is asked for', () => {
    let reads = 0;
    const read = reading((file) => {
      reads += 1;
      return file === ROOT ? SPEC : null;
    });

    expect(read.parsed(ROOT)).toBe(read.parsed(ROOT));
    expect(reads).toBe(1);
  });

  it('remembers a file it could not read, rather than asking for it again', () => {
    let reads = 0;
    const read = reading(() => {
      reads += 1;
      return null;
    });

    expect(read.parsed(ROOT)).toBeNull();
    expect(read.parsed(ROOT)).toBeNull();
    expect(reads).toBe(1);
  });

  it('hands the text through as it stands, for the files it does not parse', () => {
    const read = reading((file) => (file === ROOT ? 'APAC,1\n' : null));
    expect(read.text(ROOT)).toBe('APAC,1\n');
  });
});

describe('what an answer for one group of a rectangle says', () => {
  it('names the group in the words the refusal counted it in', () => {
    expect(excepting('range', 2)).toBe('Write the 2 that are filled by a range as overrides');
  });

  it('says one of them singly, since a count of one improves on nothing', () => {
    expect(excepting('parameter', 1)).toBe('Write the one that reads a parameter as an override');
  });

  it('says what a cell reading a definition becomes, which is not an override', () => {
    expect([excepting('definition', 1), excepting('definition', 3)]).toEqual([
      'Write the one that reads a definition as a value of its own',
      'Write the 3 that read a definition as values of their own',
    ]);
  });
});
