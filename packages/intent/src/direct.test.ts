import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type A1Addr, type FilePath, filePath, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { type Intent, setFormula, setValue, type Text } from './direct';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);

/** A spec of one or more files, read the way the extension reads one. */
function files(sources: Record<string, string>) {
  const text: Text = (file) => sources[file] ?? null;
  const read: IncludeReader = (_from, path) => {
    const file = filePath(path);
    return file === null || sources[path] === undefined ? null : { file, source: sources[path] };
  };

  const source = sources[ROOT] ?? '';
  const { doc } = load(parse(source, { file: ROOT }), read);
  if (doc === null) throw new Error('did not load');

  return { grid: compile(doc, { read }), text, read, source };
}

function edited(sources: Record<string, string>, intent: Intent): string {
  if (intent.kind !== 'edit') throw new Error(`refused: ${intent.why}`);

  const { read } = files(sources);
  const ctx: Ctx = { root: ROOT, file: intent.file, read };
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
    const { grid, text } = files(sources);

    expect(edited(sources, setValue(grid, at('B1'), 2500000, text))).toContain('B1: 2500000');
  });

  it('writes under the `value:` key when the cell was written the long way', () => {
    const cell = 'A1: { value: 0.085, format: "0.0%" }';
    const sources = { [ROOT]: `${SALES}    cells:\n      ${cell}\n` };
    const { grid, text } = files(sources);
    const after = edited(sources, setValue(grid, at('A1'), 0.09, text));

    expect(after).toContain('A1: { value: 0.09, format: "0.0%" }');
  });

  it('writes into the file the cell is in, not the one the spec was opened as', () => {
    const sources = {
      [ROOT]: 'sheets:\n  - $include: sales.yaml\n',
      'sales.yaml': 'name: Sales\ncells:\n  A1: Region\n',
    };
    const { grid, text } = files(sources);
    const intent = setValue(grid, at('A1'), 'Area', text);

    expect(intent.kind === 'edit' && intent.file).toBe('sales.yaml');
    expect(edited(sources, intent)).toBe('name: Sales\ncells:\n  A1: Area\n');
  });

  it('writes one field of an inline `data:` block', () => {
    const block = `${SALES}    data:\n      - at: A1\n        values:\n          - [Region, Revenue]\n          - [APAC, 2400000]\n`;
    const sources = { [ROOT]: block };
    const { grid, text } = files(sources);

    expect(edited(sources, setValue(grid, at('B2'), 2500000, text))).toContain('[APAC, 2500000]');
  });

  it('keeps the quoting the spec chose', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      A1: "007"\n` };
    const { grid, text } = files(sources);

    expect(edited(sources, setValue(grid, at('A1'), '008', text))).toContain('A1: "008"');
  });
});

describe('what typing into a cell will not do', () => {
  function why(sources: Record<string, string>, address: string): string {
    const { grid, text } = files(sources);
    const intent = setValue(grid, at(address), 'x', text);
    return intent.kind === 'refused' ? intent.why : '';
  }

  it('refuses a value that came from a definition, and says which', () => {
    const spec = `${SALES}    cells:\n      A1: { $ref: rate }\ndefs:\n  values:\n    rate: 0.085\n`;
    expect(why({ [ROOT]: spec }, 'A1')).toContain('reads a definition');
  });

  it('refuses a value that came from a file beside the spec', () => {
    const spec = `${SALES}    data:\n      - at: A1\n        csv: sales.csv\n`;
    const sources = { [ROOT]: spec, 'sales.csv': 'APAC,1\n' };
    const { grid, text } = files(sources);
    const intent = setValue(grid, at('A1'), 'x', text);

    expect(intent.kind === 'refused' && intent.why).toContain('sales.csv');
  });

  it('refuses a cell a `formulas:` range fills, and names the range it belongs to', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;
    expect(why({ [ROOT]: spec }, 'B2')).toContain('filled by the range anchored at `B1`');
  });

  it('refuses a cell that holds a parameter', () => {
    const spec = `params:\n  region: APAC\n${SALES}    cells:\n      A1: "\${region}"\n`;
    expect(why({ [ROOT]: spec }, 'A1')).toContain('parameter');
  });

  it('refuses an address nothing is written at', () => {
    expect(why({ [ROOT]: `${SALES}    cells:\n      A1: 1\n` }, 'Z9')).toContain('nothing is');
  });
});

describe('typing a formula into a cell', () => {
  it('writes it where the formula is written', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      B1: { formula: "SUM(A1:A2)" }\n` };
    const { grid, text } = files(sources);

    expect(edited(sources, setFormula(grid, at('B1'), 'SUM(A1:A3)', text))).toContain(
      'formula: "SUM(A1:A3)"',
    );
  });

  it('refuses to type a value over a cell written as a formula, and says what to do', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      B1: { formula: "SUM(A1:A2)" }\n` };
    const { grid, text } = files(sources);
    const intent = setValue(grid, at('B1'), 5, text);

    expect(intent.kind === 'refused' && intent.why).toContain('written as a formula');
  });

  it('refuses a cell that holds a value rather than a formula', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      A1: 1\n` };
    const { grid, text } = files(sources);
    const intent = setFormula(grid, at('A1'), 'SUM(B1:B2)', text);

    expect(intent.kind === 'refused' && intent.why).toContain('holds no formula');
  });
});
