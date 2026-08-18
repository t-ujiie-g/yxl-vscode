import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { applyPatch } from '@yxl-vscode/patch';
import { type A1Addr, type FilePath, filePath, type Rect, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { type Intent, reading } from './direct';
import { couldBlock, pasteRange, pasteText, type Shape, type Standing } from './paste';
import { tabular } from './tabular';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);
const SALES = 'sheets:\n  - name: Sales\n';

function files(sources: Record<string, string>) {
  const includes: IncludeReader = (_from, path) =>
    sources[path] === undefined ? null : { file: filePath(path) ?? ROOT, source: sources[path] };

  const { doc } = load(parse(sources[ROOT] ?? '', { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return {
    doc,
    grid: compile(doc, { read: includes }),
    read: reading((file) => sources[file] ?? null),
    includes,
  };
}

const rect = (top: number, left: number, bottom: number, right: number): Rect => ({
  top,
  left,
  bottom,
  right,
});

/** A rectangle copied from `Sales` and put down at `at`, as the intent it comes to. */
function pasted(
  source: string,
  from: Rect,
  at: string,
  options: { cut?: boolean; only?: boolean; doing?: Standing; sheet?: string } = {},
): Intent {
  const { doc, grid, read } = files({ [ROOT]: source });

  return pasteRange(
    { doc, grid },
    {
      from: { sheet: 'Sales' as SheetName, rect: from },
      to: { sheet: (options.sheet ?? 'Sales') as SheetName, at: at as A1Addr },
      cut: options.cut ?? false,
    },
    read,
    options.doing ?? (options.only === true ? 'skip' : 'refuse'),
  );
}

/** The gesture taken all the way through the checker, which is the only way in. */
function after(source: string, from: Rect, at: string, options = {}): string {
  const intent = pasted(source, from, at, options);
  if (intent.kind === 'refused') throw new Error(`refused: ${intent.why}`);
  if (intent.kind !== 'edit') throw new Error('a file was written, not a spec');

  const { includes } = files({ [ROOT]: source });
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);
  if (done.ok === false) throw new Error(`the checker refused it: ${done.diagnostics[0]?.message}`);

  return done.text;
}

/** Why a paste did not happen. */
function why(source: string, from: Rect, at: string, options = {}): string {
  const intent = pasted(source, from, at, options);
  return intent.kind === 'refused' ? intent.why : 'it was not refused';
}

describe('a rectangle put down somewhere else', () => {
  const GRID = `${SALES}    cells:\n      A1: 1\n      A2: 2\n      B1: 9\n      B2: 8\n`;

  it('writes what each cell holds at the offset, in one patch', () => {
    expect(after(GRID, rect(1, 1, 2, 1), 'C1')).toBe(
      `${SALES}    cells:\n      A1: 1\n      A2: 2\n      B1: 9\n      B2: 8\n      C1: 1\n      C2: 2\n`,
    );
  });

  it('writes over a cell that is already there, and leaves what it wears', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      B1:\n        value: 9\n        style: header\n`;

    expect(after(spec, rect(1, 1, 1, 1), 'B1')).toBe(
      `${SALES}    cells:\n      A1: 1\n      B1:\n        value: 1\n        style: header\n`,
    );
  });

  it('comes back byte for byte', () => {
    const intent = pasted(GRID, rect(1, 1, 2, 2), 'C1');
    if (intent.kind !== 'edit') throw new Error('refused');

    const done = applyPatch(GRID, intent.patch, { file: ROOT });
    if (done.back === null) throw new Error('no way back');
    expect(applyPatch(done.text, done.back, { file: ROOT }).text).toBe(GRID);
  });

  it('refuses to put the cells back where they already are', () => {
    expect(why(GRID, rect(1, 1, 2, 2), 'A1')).toBe('these cells are already here');
  });

  it('names the sheet it cannot find', () => {
    expect(why(GRID, rect(1, 1, 1, 1), 'C1', { sheet: 'Nowhere' })).toContain(
      'there is no sheet named `Nowhere`',
    );
  });

  it('leaves a hole in the rectangle as a hole, rather than emptying what it lands on', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      C2: keep\n`;

    expect(after(spec, rect(1, 1, 2, 1), 'C1')).toBe(
      `${SALES}    cells:\n      A1: 1\n      C2: keep\n      C1: 1\n`,
    );
  });
});

describe('a formula put down somewhere else', () => {
  const WITH_FORMULA = `${SALES}    cells:\n      A1: 2\n      A2: 3\n      B1: { formula: "A1*10" }\n      B2: 0\n`;

  it('moves the references it holds', () => {
    expect(after(WITH_FORMULA, rect(1, 2, 1, 2), 'B2')).toContain('B2: { formula: "A2*10" }');
  });

  it('changes the shape of a cell written as a plain value', () => {
    expect(after(WITH_FORMULA, rect(1, 2, 1, 2), 'B2')).toBe(
      `${SALES}    cells:\n      A1: 2\n      A2: 3\n      B1: { formula: "A1*10" }\n      B2: { formula: "A2*10" }\n`,
    );
  });

  it('takes the value out of a cell it gives a formula to, and leaves the style', () => {
    const spec = `${SALES}    cells:\n      A1: { formula: "1+1" }\n      B1:\n        value: 9\n        style: header\n`;

    expect(after(spec, rect(1, 1, 1, 1), 'B1')).toBe(
      `${SALES}    cells:\n      A1: { formula: "1+1" }\n      B1:\n        style: header\n        formula: 1+1\n`,
    );
  });

  it('says which formula could not be moved, and writes nothing', () => {
    expect(why(WITH_FORMULA, rect(1, 2, 1, 2), 'A1')).toContain('would move off the sheet');
  });

  it('moves a cell a `formulas:` range fills by where that cell sits, not where the range starts', () => {
    // `C2` is the range's second row, so it means `B3*2` there; put at `E5` it
    // is three rows further down and two columns right again.
    const spec = `${SALES}    cells:\n      B2: 1\n      B3: 2\n    formulas:\n      - at: C2:C3\n        formula: "B2*2"\n`;

    expect(after(spec, rect(3, 3, 3, 3), 'E5')).toContain('E5:\n        formula: "D5*2"');
  });
});

describe('a rectangle put down where nothing is written yet', () => {
  it('writes new `cells:` entries', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      A2: 2\n`;

    expect(after(spec, rect(1, 1, 2, 1), 'D5')).toBe(
      `${SALES}    cells:\n      A1: 1\n      A2: 2\n      D5: 1\n      D6: 2\n`,
    );
  });

  it('writes the `cells:` key itself where the sheet has none', () => {
    const spec = `${SALES}    data:\n      - at: A1\n        values:\n          - [1, 2]\n`;

    expect(after(spec, rect(1, 1, 1, 1), 'D5')).toContain('cells:\n      D5: 1');
  });

  it('writes a formula as a new entry, quoted the way the spec writes one', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      B1: { formula: "A1*2" }\n`;

    expect(after(spec, rect(1, 2, 1, 2), 'D5')).toContain('D5:\n        formula: "C5*2"');
  });
});

describe('a cell a paste cannot land on', () => {
  it('refuses the whole where one of them cannot take it, saying how many and why', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      A2: 2\n    formulas:\n      - at: C1:C2\n        formula: "A1"\n`;

    expect(why(spec, rect(1, 1, 2, 1), 'C1')).toContain('2 of the 2 cells here cannot be pasted');
  });

  it('pastes the ones that can take it where the reader says so', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      A2: 2\n      C2: 0\n    formulas:\n      - at: C1:C1\n        formula: "A1"\n`;

    expect(after(spec, rect(1, 1, 2, 1), 'C1', { only: true })).toBe(
      `${SALES}    cells:\n      A1: 1\n      A2: 2\n      C2: 2\n    formulas:\n      - at: C1:C1\n        formula: "A1"\n`,
    );
  });

  it('writes into a `data:` field, and refuses to put a formula in one', () => {
    const spec = `${SALES}    cells:\n      D1: 7\n      D2: { formula: "D1*2" }\n    data:\n      - at: A5\n        values:\n          - [1, 2]\n`;

    expect(after(spec, rect(1, 4, 1, 4), 'A5')).toContain('- [7, 2]');
    expect(why(spec, rect(2, 4, 2, 4), 'A5')).toContain('holds no formula');
  });

  it('refuses where nothing in the rectangle can be pasted', () => {
    expect(why(`${SALES}    cells:\n      A1: 1\n`, rect(5, 5, 6, 6), 'A1')).toBe(
      'nothing in this rectangle can be pasted here',
    );
  });
});

describe('a rectangle cut and put down somewhere else', () => {
  const GRID = `${SALES}    cells:\n      A1: 1\n      A2: 2\n      C1: keep\n`;

  it('empties what it took and writes it where it landed, in one patch', () => {
    expect(after(GRID, rect(1, 1, 2, 1), 'B1', { cut: true })).toBe(
      `${SALES}    cells:\n      C1: keep\n      B1: 1\n      B2: 2\n`,
    );
  });

  it('keeps the `cells:` mapping it empties, because the same patch fills it again', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      A2: 2\n`;

    expect(after(spec, rect(1, 1, 2, 1), 'B1', { cut: true })).toBe(
      `${SALES}    cells:\n      B1: 1\n      B2: 2\n`,
    );
  });

  it('comes back byte for byte', () => {
    const intent = pasted(GRID, rect(1, 1, 2, 1), 'B1', { cut: true });
    if (intent.kind !== 'edit') throw new Error('refused');

    const done = applyPatch(GRID, intent.patch, { file: ROOT });
    if (done.back === null) throw new Error('no way back');
    expect(applyPatch(done.text, done.back, { file: ROOT }).text).toBe(GRID);
  });

  it('refuses to land on the cells it is taking', () => {
    expect(why(GRID, rect(1, 1, 2, 1), 'A2', { cut: true })).toContain('these overlap');
  });
});

describe('a rectangle from another spreadsheet', () => {
  const SHEET = `${SALES}    cells:\n      A1: keep\n`;

  /** A clipboard rectangle put down at `at`, as the intent it comes to. */
  const from = (source: string, text: string, at: string, shape: Shape = 'cells', only = false) => {
    const { doc, grid, read } = files({ [ROOT]: source });

    return pasteText(
      { doc, grid },
      { sheet: 'Sales' as SheetName, at: at as A1Addr },
      tabular(text),
      read,
      shape,
      only ? 'skip' : 'refuse',
    );
  };

  const written = (source: string, text: string, at: string, shape: Shape = 'cells'): string => {
    const intent = from(source, text, at, shape);
    if (intent.kind !== 'edit') {
      throw new Error(intent.kind === 'refused' ? intent.why : 'not a spec edit');
    }

    const { includes } = files({ [ROOT]: source });
    const done = checked(source, intent.patch, intent.expects, {
      root: ROOT,
      file: intent.file,
      read: includes,
    });
    if (done.ok === false)
      throw new Error(`the checker refused it: ${done.diagnostics[0]?.message}`);

    return done.text;
  };

  it('writes the fields as `cells:` entries, read the way the spec would read them', () => {
    expect(written(SHEET, 'APAC\t2400000\nEMEA\t1750000', 'B1')).toBe(
      `${SALES}    cells:\n      A1: keep\n      B1: APAC\n      C1: 2400000\n      B2: EMEA\n      C2: 1750000\n`,
    );
  });

  it('writes over what is already there', () => {
    expect(written(SHEET, 'LATAM', 'A1')).toBe(`${SALES}    cells:\n      A1: LATAM\n`);
  });

  it('writes the same rectangle as one `data:` block where the reader asks for one', () => {
    expect(written(SHEET, 'APAC\t2400000\nEMEA\t1750000', 'B1', 'data')).toBe(
      `${SALES}    cells:\n      A1: keep\n    data:\n      - at: B1\n        values:\n          - ["APAC", 2400000]\n          - ["EMEA", 1750000]\n`,
    );
  });

  it('refuses a `data:` block over cells the spec already writes', () => {
    const intent = from(SHEET, 'LATAM', 'A1', 'data');
    expect(intent.kind === 'refused' && intent.why).toContain('nothing writes those cells yet');
  });

  it('says whether a `data:` block is one of the answers', () => {
    const { grid } = files({ [ROOT]: SHEET });
    const where = (at: string) => ({ sheet: 'Sales' as SheetName, at: at as A1Addr });

    expect(couldBlock(grid, where('B1'), tabular('x\ty'))).toBe(true);
    expect(couldBlock(grid, where('A1'), tabular('x'))).toBe(false);
  });

  it('refuses an empty clipboard rather than writing nothing', () => {
    const intent = from(SHEET, '', 'B1');
    expect(intent.kind === 'refused' && intent.why).toContain('nothing on the clipboard');
  });

  it('comes back byte for byte', () => {
    const intent = from(SHEET, 'APAC\t1\nEMEA\t2', 'B1');
    if (intent.kind !== 'edit') throw new Error('refused');

    const done = applyPatch(SHEET, intent.patch, { file: ROOT });
    if (done.back === null) throw new Error('no way back');
    expect(applyPatch(done.text, done.back, { file: ROOT }).text).toBe(SHEET);
  });
});

describe('a rectangle landing on cells of more than one origin', () => {
  const MIXED = `defs:
  values:
    tax: 0.1
sheets:
  - name: Sales
    cells:
      A1: 1
      A2: 2
      A3: 3
      B4: { $ref: tax }
    formulas:
      - at: B2:B3
        formula: "A1*2"
`;

  const HERE = rect(1, 1, 3, 1);

  it('refuses the whole, naming what stood in the way by what it was', () => {
    expect(why(MIXED, HERE, 'B3')).toBe(
      '2 of the 2 cells here cannot be pasted, so none were: `B3` is filled by a range, `B4` reads a definition',
    );
  });

  it('pastes only the cells nothing stood in front of, where that is the answer taken', () => {
    const done = pasted(MIXED, HERE, 'B3', { doing: 'skip' });
    expect(done.kind === 'edit' && [...done.expects.cells]).toEqual(['Sales!B5']);
  });

  it('writes the range one as an override and leaves the definition one alone', () => {
    const done = pasted(MIXED, HERE, 'B3', { doing: 'range' });
    expect(done.kind === 'edit' && [...done.expects.cells].sort()).toEqual([
      'Sales!B3',
      'Sales!B5',
    ]);
  });

  it('puts that override where the spec keeps its exceptions, saying what the cell holds', () => {
    expect(after(MIXED, HERE, 'B3', { doing: 'range' })).toBe(
      `${MIXED.replace('    formulas:', '      B5: 3\n    formulas:')}overrides:\n  - at: Sales!B3\n    value: 1\n`,
    );
  });

  it('writes the definition one as a value of its own and leaves the range one alone', () => {
    const done = pasted(MIXED, HERE, 'B3', { doing: 'definition' });
    expect(done.kind === 'edit' && [...done.expects.cells].sort()).toEqual([
      'Sales!B4',
      'Sales!B5',
    ]);
  });

  it('writes it over the reference itself, leaving the definition where it is', () => {
    const after_ = after(MIXED, HERE, 'B3', { doing: 'definition' });
    expect(after_).toContain('      B4: 2\n');
    expect(after_).toContain('    tax: 0.1\n');
  });

  it('refuses a group answer where one of the cells is a range anchor', () => {
    const done = pasted(MIXED, rect(1, 1, 2, 1), 'B2', { doing: 'range' });
    expect(done.kind === 'refused' && done.why).toContain('where a range keeps its one formula');
  });
});
