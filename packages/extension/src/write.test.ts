import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { did, type History, nothing } from '@yxl-vscode/patch';
import { type FilePath, filePath, parseColor } from '@yxl-vscode/units';
import type { Choice, Frozen, Resized, Typed, Worn } from '@yxl-vscode/webview/protocol';
import { describe, expect, it } from 'vitest';
import { fill } from './fills';
import { group } from './group';
import { hide } from './hidden';
import { line } from './lines';
import { link } from './links';
import { wear } from './look';
import { note } from './notes';
import { filter, freeze } from './panes';
import { add, move, remove, rename, tab } from './sheets';
import { resize } from './size';
import { sort } from './sorts';
import { table } from './tables';
import { validate } from './validations';
import { emptied, empty, type Port, resolve, type Spec, write, writeOverride } from './write';

const ROOT = filePath('/specs/report.yxl.yaml') ?? ('' as FilePath);

/** A spec of one or more files, and a port that remembers what happened to them. */
function editor(sources: Record<string, string>) {
  const files = { ...sources };
  const refusals: string[] = [];

  const read: IncludeReader = (_from, path) => {
    const file = filePath(path.startsWith('/') ? path : `/specs/${path}`);
    return file === null || files[file] === undefined ? null : { file, source: files[file] };
  };

  const { doc } = load(parse(files[ROOT] ?? '', { file: ROOT }), read);
  if (doc === null) throw new Error('did not load');

  const spec: Spec = { root: ROOT, doc, grid: compile(doc, { read }), read, params: new Map() };
  const offers: (Typed | null)[] = [];
  const answers: Choice[][] = [];
  const told: string[] = [];
  const left = new Map<string, string>();
  const stack = { history: nothing as History };
  const port: Port = {
    text: (file) => files[file] ?? null,
    put: (file, text) => {
      files[file] = text;
      left.set(file, text);
    },
    refuse: (why, offer) => {
      refusals.push(why);
      offers.push(offer?.canOverride === true && offer.about?.kind === 'edit' ? offer.about : null);
      answers.push([...(offer?.choices ?? [])]);
    },
    said: (what) => {
      told.push(what);
    },
    kept: (step) => {
      if (step === null) {
        stack.history = nothing;
        left.clear();
        return;
      }

      stack.history = did(stack.history, step);
    },
    left: (file) => left.get(file) ?? null,
  };

  return { spec, port, files, refusals, offers, answers, told, stack };
}

const typed = (of: Partial<Typed> = {}): Typed => ({
  sheet: 'Sales',
  row: 1,
  col: 1,
  text: 'EMEA',
  ...of,
});

const SALES = 'sheets:\n  - name: Sales\n';

/** A sheet whose rows come from a `data:` block, with a blank line under it. */
const BESIDE_DATA = `${SALES}    data:\n      - at: A1\n        values:\n          - [APAC, 1]\n          - [EMEA, 2]\n`;

describe('what a reader typed, all the way to the file', () => {
  it('writes a value where the spec wrote the cell', async () => {
    const spec = { [ROOT]: `${SALES}    cells:\n      A1: APAC\n` };
    const { spec: read, port, files } = editor(spec);

    await write(read, typed(), port);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: EMEA\n`);
  });

  it('reads what was typed the way the spec would read it', async () => {
    const spec = { [ROOT]: `${SALES}    cells:\n      A1: APAC\n      B1: 1\n` };

    for (const [text, written] of [
      ['42', 'B1: 42'],
      ['true', 'B1: true'],
      ['4.5', 'B1: 4.5'],
    ] as const) {
      const { spec: read, port, files } = editor(spec);
      await write(read, typed({ col: 2, text }), port);

      expect(files[ROOT]).toContain(written);
    }
  });

  it('takes a leading `=` as a formula, as every spreadsheet does', async () => {
    const spec = { [ROOT]: `${SALES}    cells:\n      B1: { formula: "SUM(A1:A2)" }\n` };
    const { spec: read, port, files } = editor(spec);

    await write(read, typed({ col: 2, text: '=SUM(A1:A3)' }), port);
    expect(files[ROOT]).toContain('formula: "SUM(A1:A3)"');
  });

  it('writes into the file that holds the cell, not the one that was opened', async () => {
    const spec = {
      [ROOT]: 'sheets:\n  - $include: sales.yaml\n',
      '/specs/sales.yaml': 'name: Sales\ncells:\n  A1: APAC\n',
    };
    const { spec: read, port, files } = editor(spec);

    await write(read, typed(), port);
    expect(files['/specs/sales.yaml']).toBe('name: Sales\ncells:\n  A1: EMEA\n');
    expect(files[ROOT]).toBe('sheets:\n  - $include: sales.yaml\n');
  });
});

describe('the exception, when the ordinary edit is refused', () => {
  const FILLED = `${SALES}    cells:\n      A1: 1\n      A2: 2\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;

  it('is offered for a cell that is there but cannot be typed into', async () => {
    const { spec, port, offers } = editor({ [ROOT]: FILLED });

    await write(spec, typed({ col: 2, row: 2, text: '99' }), port);
    expect(offers[0]).toEqual({ kind: 'edit', ...typed({ col: 2, row: 2, text: '99' }) });
  });

  it('is offered under the kind it was refused as, whatever kind carried it', async () => {
    // The view sends this back with its own `kind` last, which is how an
    // override goes out as an override rather than as the edit it excepts.
    const { spec, port, offers } = editor({ [ROOT]: FILLED });
    const message = { ...typed({ col: 2, row: 2, text: '99' }), kind: 'wear' } as Typed;

    await write(spec, message, port);
    expect(offers[0]).toMatchObject({ kind: 'edit' });
  });

  it('is not offered where there is no cell to make an exception of', async () => {
    const { spec, port, offers } = editor({ [ROOT]: BESIDE_DATA });

    await write(spec, typed({ col: 1, row: 3, text: 'Total' }), port);
    expect(offers[0]).toBeNull();
  });

  it('writes the override when it is asked for, with the reason given', async () => {
    const { spec, port, files, told } = editor({ [ROOT]: FILLED });

    await writeOverride(spec, typed({ col: 2, row: 2, text: '99' }), 'this row is settled', port);
    expect(files[ROOT]).toContain('overrides:\n  - at: Sales!B2\n    value: 99');
    expect(files[ROOT]).toContain('reason: "this row is settled"');

    // An override lands at the end of the file, where the reader is not
    // looking, so it says so.
    expect(told[0]).toContain('Sales!B2');
  });

  it('says nothing about a write it did not make', async () => {
    const { spec, port, told, refusals } = editor({ [ROOT]: FILLED });

    // Already overridden once, so the second is refused.
    await writeOverride(spec, typed({ col: 2, row: 2, text: '1' }), undefined, port);
    const {
      spec: again,
      port: twice,
      told: quiet,
    } = editor({
      [ROOT]: `${FILLED}overrides:\n  - at: Sales!B2\n    value: 1\n`,
    });
    await writeOverride(again, typed({ col: 2, row: 2, text: '2' }), undefined, twice);

    expect(told).toHaveLength(1);
    expect(quiet).toHaveLength(0);
    expect(refusals).toHaveLength(0);
  });

  it('writes one without a reason, since the reason is the reader\u2019s to give', async () => {
    const { spec, port, files } = editor({ [ROOT]: FILLED });

    await writeOverride(spec, typed({ col: 2, row: 2, text: '99' }), undefined, port);
    expect(files[ROOT]).toContain('value: 99');
    expect(files[ROOT]).not.toContain('reason');
  });

  it('takes a leading `=` as a formula there too', async () => {
    const { spec, port, files } = editor({ [ROOT]: FILLED });

    await writeOverride(spec, typed({ col: 2, row: 2, text: '=A2*10' }), undefined, port);
    expect(files[ROOT]).toContain('formula: "A2*10"');
  });
});

describe('what a reader typed, and did not get', () => {
  it('says why, and leaves every file alone', async () => {
    const spec = {
      [ROOT]: `${SALES}    cells:\n      A1: { $ref: rate }\ndefs:\n  values:\n    rate: 1\n`,
    };
    const { spec: read, port, files, refusals } = editor(spec);

    await write(read, typed(), port);
    expect(refusals[0]).toContain('reads a definition');
    expect(files[ROOT]).toBe(spec[ROOT]);
  });

  it('refuses a number typed over a formula, cached result and all', async () => {
    const cell = 'B1: { formula: "SUM(A1:A2)", value: 3 }';
    const spec = { [ROOT]: `${SALES}    cells:\n      A1: 1\n      ${cell}\n` };
    const { spec: read, port, files, refusals } = editor(spec);

    await write(read, typed({ col: 2, text: '5' }), port);
    expect(refusals[0]).toContain('holds a formula');
    expect(files[ROOT]).toBe(spec[ROOT]);
  });

  it('refuses an edit that would break the spec', async () => {
    const spec = { [ROOT]: `${SALES}    columns:\n      - at: A\n        width: 10\n` };
    const { spec: read, port, refusals } = editor(spec);

    // Nothing is written at A1 — a band is not a cell to type into.
    await write(read, typed(), port);
    expect(refusals[0]).not.toBe('');
  });

  it('says nothing and writes nothing for a sheet it does not know', async () => {
    const spec = { [ROOT]: `${SALES}    cells:\n      A1: APAC\n` };
    const { spec: read, port, files, refusals } = editor(spec);

    await write(read, typed({ sheet: 'Nowhere' }), port);
    expect(refusals[0]).toContain('no sheet named');
    expect(files[ROOT]).toBe(spec[ROOT]);
  });
});

describe('the answers an edit has, when it has more than one', () => {
  const RANGE = `${SALES}    cells:\n      A1: 1\n      A2: 2\n    formulas:\n      - at: B1:B2\n        formula: "A1*2"\n`;
  const at = typed({ row: 1, col: 2, text: '=A1*3' });

  it('offers the range its own formula, with every cell it would move', async () => {
    const { spec, port, answers } = editor({ [ROOT]: RANGE });

    await write(spec, at, port);
    expect(answers[0]).toEqual([
      {
        id: 'rangeFormula',
        what: 'Change the formula of the range at `B1`',
        moves: 2,
        sample: ['B1', 'B2'],
      },
    ]);
  });

  it('writes the one the reader chose, and says what it moved', async () => {
    const { spec, port, files, told } = editor({ [ROOT]: RANGE });

    await resolve(spec, at, 'rangeFormula', port);
    expect(files[ROOT]).toContain('formula: "A1*3"');
    expect(told[0]).toContain('2 cells');
  });

  it("offers both answers below the anchor, the range's formula shifted back to it", async () => {
    const down = `${SALES}    cells:\n      A1: 1\n      A2: 2\n    formulas:\n      - at: B1:B2\n        formula: "A1*2"\n`;
    const { spec, port, answers } = editor({ [ROOT]: down });

    await write(spec, typed({ row: 2, col: 2, text: '=A2*3' }), port);
    expect(answers[0]).toEqual([
      {
        id: 'rangeFormula',
        what: 'Change the formula of the range at `B1`, which reads `=A1*3` there',
        moves: 2,
        sample: ['B1', 'B2'],
      },
      {
        id: 'splitRange',
        what: 'Split the range at `B1` so `B2` holds its own formula',
        moves: 1,
        sample: ['B2'],
      },
    ]);
  });

  it('refuses an answer that is not one of the ones offered', async () => {
    const { spec, port, refusals, files } = editor({ [ROOT]: RANGE });

    await resolve(spec, at, 'somethingElse', port);
    expect(refusals[0]).toContain('no longer one of the ways');
    expect(files[ROOT]).toBe(RANGE);
  });

  it('offers nothing where the edit had one answer all along', async () => {
    const { spec, port, answers } = editor({ [ROOT]: `${SALES}    cells:\n      A1: APAC\n` });

    await write(spec, typed({ text: '=A2' }), port);
    expect(answers[0]).toEqual([]);
  });
});

describe('a cell nothing has written yet', () => {
  const at = typed({ row: 5, col: 1, text: 'Total' });

  it('is written where the sheet keeps its cells, without being asked about', async () => {
    // One answer and nothing to weigh it against, so it applies: a click in
    // front of typing into a blank cell would be a click too many (ADR-001).
    const { spec, port, files, refusals } = editor({
      [ROOT]: `${SALES}    cells:\n      A1: APAC\n`,
    });

    await write(spec, at, port);
    expect(refusals).toEqual([]);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: APAC\n      A5: Total\n`);
  });

  it('is asked about where a `data:` rectangle could hold it instead', async () => {
    // Extending the rectangle is the other answer, and where there are two the
    // reader picks. No override beside them: there is no cell to except yet.
    const { spec, port, answers, offers, files } = editor({ [ROOT]: BESIDE_DATA });

    await write(spec, typed({ row: 3, col: 1, text: 'Total' }), port);
    expect(answers[0]).toEqual([
      { id: 'newCell', what: 'Write `A3` as a new cell', moves: 1, sample: ['A3'] },
      { id: 'ontoBlock', what: 'Add a row to the table at `A1`', moves: 1, sample: ['A3'] },
    ]);
    expect(offers[0]).toBeNull();
    expect(files[ROOT]).toBe(BESIDE_DATA);
  });

  it('puts the row into the table where that is the answer taken', async () => {
    const { spec, port, files } = editor({ [ROOT]: BESIDE_DATA });
    const at = typed({ row: 3, col: 1, text: 'Total' });

    await write(spec, at, port);
    await resolve(spec, at, 'ontoBlock', port);

    expect(files[ROOT]).toBe(
      BESIDE_DATA.replace('- [EMEA, 2]\n', '- [EMEA, 2]\n          - [Total]\n'),
    );
  });

  it('is written as the answer says when the reader takes it', async () => {
    const { spec, port, files } = editor({ [ROOT]: BESIDE_DATA });

    await resolve(spec, typed({ row: 3, col: 1, text: 'Total' }), 'newCell', port);
    expect(files[ROOT]).toContain('A3: Total');
  });
});

describe('a cell emptied', () => {
  it('takes the entry out rather than leaving a cell with nothing in it', async () => {
    // `A1:` with no value is a spec the compiler refuses (`docs/spec.md` §3),
    // so Delete has to take the line, not blank it.
    const { spec, port, files, refusals } = editor({
      [ROOT]: `${SALES}    cells:\n      A1: APAC\n      B1: 1\n`,
    });

    await write(spec, typed({ text: '' }), port);
    expect(refusals).toEqual([]);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      B1: 1\n`);
  });
});

describe('an edit that would move more than it named', () => {
  // `rows` decides how far the range reaches, so changing it writes a cell the
  // parameter itself never touched.
  const REACHES = `params:
  rows: 2
sheets:
  - name: Sales
    cells:
      A1: 1
      A2: 2
      A3: 3
      C1: "\${rows}"
    formulas:
      - at: "B1:B\${rows}"
        formula: "A1"
`;
  const at = typed({ row: 1, col: 3, text: '3' });

  it('is asked about, with what else it would move', async () => {
    const { spec, port, refusals, answers, files } = editor({ [ROOT]: REACHES });

    await resolve(spec, at, 'parameter', port);
    expect(refusals[0]).toContain('would also change');
    expect(answers[0]).toEqual([
      { id: 'anyway:parameter', what: 'Apply it anyway', moves: 1, sample: ['Sales!B3'] },
    ]);
    expect(files[ROOT]).toBe(REACHES);
  });

  it('is made when the reader says yes, from the file as it stands', async () => {
    const { spec, port, files, refusals } = editor({ [ROOT]: REACHES });

    await resolve(spec, at, 'anyway:parameter', port);
    expect(refusals).toEqual([]);
    expect(files[ROOT]).toContain('rows: 3');
  });

  it('offers no override beside the question, which is not what it is asking', async () => {
    const { spec, port, offers } = editor({ [ROOT]: REACHES });

    await resolve(spec, at, 'parameter', port);
    expect(offers[0]).toBeNull();
  });
});

describe('a rectangle emptied', () => {
  const GRID = `${SALES}    cells:\n      A1: 1\n      B1: 2\n      A2: 3\n      B2: 4\n      C1: keep\n`;
  const rect = { sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 2 };

  it('takes every cell of it out in one write, and says how many', async () => {
    const { spec, port, files, told } = editor({ [ROOT]: GRID });

    await empty(spec, rect, port);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      C1: keep\n`);
    expect(told).toEqual(['4 cells emptied.']);
  });

  it('refuses the whole where a cell in it cannot be emptied, and writes nothing', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;
    const { spec: read, port, files, refusals } = editor({ [ROOT]: spec });

    await empty(read, rect, port);
    expect(files[ROOT]).toBe(spec);
    expect(refusals[0]).toContain('cannot be emptied, so none were');
  });

  const HELD = `${SALES}    cells:\n      A1: 1\n      A2: 2\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;

  it('offers to empty the ones that can be, naming how many and which', async () => {
    const { spec, port, answers } = editor({ [ROOT]: HELD });

    await empty(spec, rect, port);
    expect(answers[0]).toEqual([
      {
        id: 'only',
        what: 'Empty the ones that can be',
        moves: 2,
        sample: ['Sales!A1', 'Sales!A2'],
      },
    ]);
  });

  it('empties those and leaves the rest where the reader takes that answer', async () => {
    const { spec, port, files, told, refusals } = editor({ [ROOT]: HELD });

    await emptied(spec, rect, 'only', port);
    expect(refusals).toEqual([]);
    expect(files[ROOT]).toBe(`${SALES}    formulas:\n      - at: B1:B2\n        formula: "A1"\n`);
    expect(told).toEqual(['2 cells emptied.']);
  });

  it('takes no answer it did not offer', async () => {
    const { spec, port, files, refusals } = editor({ [ROOT]: HELD });

    await emptied(spec, rect, 'anything', port);
    expect(files[ROOT]).toBe(HELD);
    expect(refusals[0]).toContain('no longer one of the ways');
  });

  it('offers nothing where nothing in the rectangle could be emptied', async () => {
    const { spec, port, answers } = editor({
      [ROOT]: `${SALES}    cells:\n      C1: 1\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`,
    });

    await empty(spec, rect, port);
    expect(answers[0]).toEqual([]);
  });

  it('refuses a sheet name no sheet can have', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: GRID });

    await empty(spec, { ...rect, sheet: '' }, port);
    expect(refusals[0]).toContain('is not a name a sheet can have');
  });
});

describe('a column or a row dragged to a size', () => {
  const dragged = (of: Partial<Resized> = {}): Resized => ({
    sheet: 'Sales',
    axis: 'column',
    first: 4,
    last: 4,
    size: 20,
    ...of,
  });

  it('lands without asking where nothing sizes it yet', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const { spec: read, port, files, told } = editor({ [ROOT]: spec });

    await resize(read, dragged(), port);
    expect(files[ROOT]).toContain('    columns:\n      - at: D\n        width: 20\n');
    expect(told).toEqual(['Column D resized.']);
  });

  it('asks where the band it takes its size from is about more than it', async () => {
    const spec = `${SALES}    columns:\n      - at: D-F\n        width: 12\n    cells:\n      A1: 1\n`;
    const { spec: read, port, answers, refusals, files } = editor({ [ROOT]: spec });

    await resize(read, dragged({ first: 5, last: 5 }), port);
    expect(refusals[0]).toContain('more than one way to change it');
    expect(answers[0]?.map((one) => one.id)).toEqual(['band', 'apart']);
    expect(files[ROOT]).toBe(spec);
  });

  it('splits the band where that is the answer picked', async () => {
    const spec = `${SALES}    columns:\n      - at: D-F\n        width: 12\n    cells:\n      A1: 1\n`;
    const { spec: read, port, files } = editor({ [ROOT]: spec });

    await resize(read, dragged({ first: 5, last: 5 }), port, 'apart');
    expect(files[ROOT]).toContain(
      '      - at: D\n        width: 12\n      - at: E\n        width: 20\n      - at: F\n        width: 12\n',
    );
  });

  it('sizes every column the reader had selected, and says which', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const { spec: read, port, files, told } = editor({ [ROOT]: spec });

    await resize(read, dragged({ first: 2, last: 4 }), port);
    expect(files[ROOT]).toContain('    columns:\n      - at: B-D\n        width: 20\n');
    expect(told).toEqual(['Columns B-D resized.']);
  });

  it('refuses a sheet that is not one', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: `${SALES}    cells:\n      A1: 1\n` });

    await resize(spec, dragged({ sheet: '' }), port);
    expect(refusals[0]).toContain('is not a name a sheet can have');
  });

  it('says so where the sheet is named but not there', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: `${SALES}    cells:\n      A1: 1\n` });

    await resize(spec, dragged({ sheet: 'Nowhere' }), port);
    expect(refusals[0]).toContain('nothing here can say how wide column D is');
  });
});

describe('a look over a whole column', () => {
  const BOLD = { 'font.bold': true } as const;

  it('lands as a band without asking, since that is what the spec would write', async () => {
    const spec = `${SALES}    cells:\n      B1: 2\n      B2: 3\n`;
    const { spec: read, port, files, told } = editor({ [ROOT]: spec });

    await wear(
      read,
      { sheet: 'Sales', top: 1, left: 2, bottom: 400, right: 2, want: BOLD, whole: 'columns' },
      port,
    );

    expect(files[ROOT]).toBe(
      `${spec}    columns:\n      - at: B\n        style: { font: { bold: true } }\n`,
    );
    expect(told).toEqual(['2 cells restyled.']);
  });
});

describe('a cell typed with a line break in it', () => {
  it('is written as one value, quoted the way YAML holds a break', async () => {
    const spec = { [ROOT]: `${SALES}    cells:\n      A1: APAC\n` };
    const { spec: read, port, files } = editor(spec);

    await write(read, typed({ text: 'one\ntwo' }), port);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: "one\\ntwo"\n`);
  });

  it('comes back out of the file as the two lines it was', async () => {
    const spec = { [ROOT]: `${SALES}    cells:\n      A1: "one\\ntwo"\n` };
    const { spec: read } = editor(spec);

    expect(read.grid.sheets[0]?.cells.get('A1')?.value).toBe('one\ntwo');
  });
});

describe('columns hidden from the preview', () => {
  const hiding = (of: Partial<Parameters<typeof hide>[1]> = {}) => ({
    sheet: 'Sales' as const,
    axis: 'column' as const,
    first: 2,
    last: 3,
    hidden: true,
    ...of,
  });

  it('writes a band of their own, and says which', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const { spec: read, port, files, told } = editor({ [ROOT]: spec });

    await hide(read, hiding(), port);
    expect(files[ROOT]).toBe(`${spec}    columns:\n      - at: B-C\n        hidden: true\n`);
    expect(told).toEqual(['columns B-C hidden.']);
  });

  it('shows them again by taking the band away', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n    columns:\n      - at: B-C\n        hidden: true\n`;
    const { spec: read, port, files, told } = editor({ [ROOT]: spec });

    await hide(read, hiding({ hidden: false }), port);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: 1\n`);
    expect(told).toEqual(['columns B-C shown again.']);
  });

  it('asks where what hides them says it about more', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n    columns:\n      - at: A-F\n        hidden: true\n`;
    const { spec: read, port, answers, refusals, files } = editor({ [ROOT]: spec });

    await hide(read, hiding({ hidden: false }), port);
    expect(refusals[0]).toContain('more than one way to change it');
    expect(answers[0]?.map((one) => one.id)).toEqual(['band', 'apart']);
    expect(files[ROOT]).toBe(spec);
  });

  it('takes an answer confirmed with *apply it anyway*, which names the answer inside it', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n    columns:\n      - at: A-F\n        hidden: true\n`;
    const { spec: read, port, files } = editor({ [ROOT]: spec });

    await hide(read, hiding({ hidden: false }), port, 'anyway:apart');
    expect(files[ROOT]).toContain('      - at: B-C\n        hidden: false\n');
  });

  it('says so where nothing hides them', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: `${SALES}    cells:\n      A1: 1\n` });

    await hide(spec, hiding({ hidden: false }), port);
    expect(refusals[0]).toContain('nothing hides columns B-C');
  });
});

describe('a sheet added from the tab bar', () => {
  it('goes last in `sheets:` and says so', async () => {
    const { spec, port, files, told, refusals } = editor({
      [ROOT]: `${SALES}    cells:\n      A1: 1\n`,
    });

    await add(spec, 'Notes', port);

    expect(refusals).toEqual([]);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: 1\n  - name: Notes\n`);
    expect(told).toEqual(['`Notes` added.']);
  });

  it('is refused under a name a sheet already has', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: `${SALES}    cells:\n      A1: 1\n` });

    await add(spec, 'Sales', port);
    expect(refusals[0]).toBe('there is already a sheet named `Sales`');
  });
});

describe('a sheet renamed from its tab', () => {
  it('rewrites its `name:` and every formula that named it', async () => {
    const { spec, port, files, told, refusals } = editor({
      [ROOT]: `${SALES}    cells:\n      A1: 1\n  - name: Notes\n    cells:\n      A1: { formula: "Sales!A1+1" }\n`,
    });

    await rename(spec, 'Sales', 'Revenue', port);

    expect(refusals).toEqual([]);
    expect(files[ROOT]).toBe(
      'sheets:\n  - name: Revenue\n    cells:\n      A1: 1\n  - name: Notes\n    cells:\n      A1: { formula: "Revenue!A1+1" }\n',
    );
    expect(told).toEqual(['`Sales` is `Revenue` now.']);
  });

  it('is refused under a name a sheet already has', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: `${SALES}  - name: Notes\n` });

    await rename(spec, 'Sales', 'Notes', port);
    expect(refusals[0]).toBe('there is already a sheet named `Notes`');
  });
});

describe('a sheet auto filter, set from a cell menu', () => {
  it('writes the header row of the selection, and takes the key off again', async () => {
    const { spec, port, files, told } = editor({
      [ROOT]: `${SALES}    cells:\n      A1: Region\n`,
    });

    await filter(spec, { sheet: 'Sales', top: 1, left: 1, bottom: 9, right: 3, on: true }, port);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: Region\n    filter: A1:C1\n`);
    expect(told).toEqual(['Sales has a filter on its header row.']);

    await filter(spec, { sheet: 'Sales', top: 1, left: 1, bottom: 1, right: 1, on: false }, port);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: Region\n`);
  });
});

describe("a cell's note, written from its own menu", () => {
  it('writes the note under `comments`, changes it, and takes it off again', async () => {
    const { spec, port, files, told, refusals } = editor({
      [ROOT]: `${SALES}    cells:\n      A1: Region\n`,
    });
    const cells = `${SALES}    cells:\n      A1: Region\n`;

    await note(spec, { sheet: 'Sales', row: 1, col: 1, text: 'check stock' }, port);
    expect(files[ROOT]).toBe(`${cells}    comments:\n      A1: check stock\n`);
    expect(told).toEqual(['A1 carries a note.']);

    await note(spec, { sheet: 'Sales', row: 1, col: 1, text: null }, port);
    expect(files[ROOT]).toBe(cells);

    await note(spec, { sheet: 'Sales', row: 1, col: 1, text: null }, port);
    expect(refusals[0]).toBe('`A1` has no note to take off');
  });
});

describe("a cell's link, written from its own menu", () => {
  it('writes each kind in the form it takes, and takes the link off again', async () => {
    const cells = `${SALES}    cells:\n      A1: Region\n`;
    const { spec, port, files, told, refusals } = editor({ [ROOT]: cells });
    const where = { sheet: 'Sales', row: 1, col: 1 };

    await link(spec, { ...where, link: { kind: 'url', text: 'https://example.com' } }, port);
    expect(files[ROOT]).toBe(`${cells}    links:\n      A1: https://example.com\n`);
    expect(told).toEqual(['A1 goes to https://example.com.']);

    await link(spec, { ...where, link: null }, port);
    expect(files[ROOT]).toBe(cells);

    await link(spec, { ...where, link: { kind: 'to', text: 'Sales!B2' } }, port);
    expect(files[ROOT]).toBe(`${cells}    links:\n      A1:\n        to: "Sales!B2"\n`);

    await link(spec, { ...where, link: null }, port);
    await link(spec, { ...where, link: null }, port);
    expect(refusals[0]).toBe('`A1` has no link to take off');
  });
});

describe('a list validation, written over a selection', () => {
  it('writes the choices, says how many, and takes the entry off again', async () => {
    const cells = `${SALES}    cells:\n      A1: Region\n`;
    const { spec, port, files, told, refusals } = editor({ [ROOT]: cells });
    const over = { sheet: 'Sales', top: 2, left: 2, bottom: 9, right: 2 };

    await validate(spec, { ...over, choices: ['Draft', 'Sent'] }, port);
    expect(files[ROOT]).toBe(
      `${cells}    validations:\n      - at: B2:B9\n        list: [Draft, Sent]\n`,
    );
    expect(told).toEqual(['That range takes one of 2.']);

    await validate(spec, { ...over, choices: null }, port);
    expect(files[ROOT]).toBe(cells);

    await validate(spec, { ...over, choices: null }, port);
    expect(refusals[0]).toBe('nothing here has a validation to take off');
  });
});

describe('a sheet taken out from its tab', () => {
  it('takes its entry, and says so', async () => {
    const { spec, port, files, told, refusals } = editor({
      [ROOT]: `${SALES}    cells:\n      A1: 1\n  - name: Notes\n    cells:\n      A1: hello\n`,
    });

    await remove(spec, 'Notes', port);

    expect(refusals).toEqual([]);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: 1\n`);
    expect(told).toEqual(['`Notes` taken out.']);
  });

  it('is refused where a surviving formula names it', async () => {
    const { spec, port, refusals } = editor({
      [ROOT]: `${SALES}    cells:\n      A1: 1\n  - name: Notes\n    cells:\n      A1: { formula: "Sales!A1*2" }\n`,
    });

    await remove(spec, 'Sales', port);
    expect(refusals[0]).toContain('would be left with `#REF!`');
  });
});

describe('a sheet dragged along the tab bar', () => {
  it('writes the sheets in the new order, and says so', async () => {
    const { spec, port, files, told, refusals } = editor({
      [ROOT]: `${SALES}    cells:\n      A1: 1\n  - name: Notes\n    cells:\n      A1: hello\n`,
    });

    await move(spec, 'Notes', 0, port);

    expect(refusals).toEqual([]);
    expect(files[ROOT]).toBe(
      'sheets:\n  - name: Notes\n    cells:\n      A1: hello\n  - name: Sales\n    cells:\n      A1: 1\n',
    );
    expect(told).toEqual(['`Notes` moved.']);
  });
});

describe("a tab's own two keys", () => {
  const BOTH = `${SALES}    cells:\n      A1: 1\n  - name: Notes\n    cells:\n      A1: hello\n`;

  it('hides a sheet and gives it a colour, and says so', async () => {
    const { spec, port, files, told, refusals } = editor({ [ROOT]: BOTH });

    await tab(spec, 'Notes', { visibility: 'hidden' }, port);
    await tab(spec, 'Sales', { color: parseColor('1F77B4') }, port);

    expect(refusals).toEqual([]);
    expect(files[ROOT]).toBe(
      'sheets:\n  - name: Sales\n    cells:\n      A1: 1\n    tab_color: 1F77B4\n  - name: Notes\n    cells:\n      A1: hello\n    visibility: hidden\n',
    );
    expect(told).toEqual(['`Notes` set.', '`Sales` set.']);
  });

  it('turns the gridlines off and back on', async () => {
    const { spec, port, files } = editor({ [ROOT]: BOTH });

    await tab(spec, 'Notes', { gridlines: false }, port);
    expect(files[ROOT]).toBe(`${BOTH}    gridlines: false\n`);

    await tab(spec, 'Notes', { gridlines: true }, port);
    expect(files[ROOT]).toBe(BOTH);
  });

  it('is refused where hiding it would leave nothing showing', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: `${SALES}    cells:\n      A1: 1\n` });

    await tab(spec, 'Sales', { visibility: 'hidden' }, port);
    expect(refusals[0]).toBe('a workbook needs a sheet that shows, and this is the only one');
  });
});

describe('rows of a table put in order', () => {
  const TABLE = `${SALES}    data:\n      - at: A1\n        values:\n          - [EMEA, 3]\n          - [APAC, 1]\n`;

  it('writes the rows in order and says how many moved', async () => {
    const { spec, port, files, told } = editor({ [ROOT]: TABLE });

    await sort(spec, { sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 1, down: false }, port);

    expect(files[ROOT]).toContain('          - [APAC, 1]\n          - [EMEA, 3]\n');
    expect(told).toEqual(['2 rows in order.']);
  });

  it('says so where the rows are not a table written here', async () => {
    const spec = `${SALES}    cells:\n      A1: EMEA\n      A2: APAC\n`;
    const { spec: read, port, refusals } = editor({ [ROOT]: spec });

    await sort(read, { sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 1, down: false }, port);
    expect(refusals[0]).toBe(
      'these rows are not a table written here, so there is no order to put them in',
    );
  });
});

describe('a rectangle filled from its first line', () => {
  const COLUMN = `${SALES}    cells:\n      B1: 10\n      B2: 20\n      C1: { formula: "B1*2" }\n`;

  it('offers the range first and a cell each second, and takes the one picked', async () => {
    const { spec, port, answers, files } = editor({ [ROOT]: COLUMN });
    const asked = { sheet: 'Sales', top: 1, left: 3, bottom: 2, right: 3, axis: 'row' } as const;

    await fill(spec, asked, port);
    expect(answers[0]?.map((one) => one.id)).toEqual(['range', 'onCells']);

    await fill(spec, asked, port, 'range');
    expect(files[ROOT]).toContain('    formulas:\n      - at: C1:C2\n        formula: "B1*2"\n');
  });

  it('says so where the line it would fill from is empty', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: COLUMN });

    await fill(spec, { sheet: 'Sales', top: 1, left: 9, bottom: 3, right: 9, axis: 'row' }, port);
    expect(refusals[0]).toBe(
      'nothing on the first row of this is written, so there is nothing to fill',
    );
  });
});

describe('a rectangle kept as a table', () => {
  const ROWS = `${SALES}    cells:\n      A1: APAC\n      B1: 1\n      A2: EMEA\n      B2: 2\n`;

  it('writes the block and says how much of the sheet it took over', async () => {
    const { spec, port, files, told } = editor({ [ROOT]: ROWS });

    await table(spec, { sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 2 }, port);

    expect(files[ROOT]).toContain(
      '    data:\n      - at: A1\n        values:\n          - [APAC, 1]\n          - [EMEA, 2]\n',
    );
    expect(told).toEqual(['2 rows are one table now.']);
  });

  it('says why where a cell there cannot go into one', async () => {
    const spec = `${SALES}    cells:\n      A1: { value: APAC, format: "0.0%" }\n      A2: EMEA\n`;
    const { spec: read, port, refusals } = editor({ [ROOT]: spec });

    await table(read, { sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 1 }, port);
    expect(refusals[0]).toBe('`A1` says more than a value, which a table has nowhere to keep');
  });
});

describe('rows put in and taken away from the heading', () => {
  const SHEET = `${SALES}    cells:\n      A1: Region\n      A5: Total\n`;

  it('moves the keys below it and says what moved', async () => {
    const { spec, port, files, told } = editor({ [ROOT]: SHEET });

    await line(spec, { sheet: 'Sales', axis: 'row', at: 5, by: 1 }, port);

    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: Region\n      A6: Total\n`);
    expect(told).toEqual(['row 5 put in.']);
  });

  it('takes a row away, and the cells inside it with it', async () => {
    const { spec, port, files } = editor({ [ROOT]: SHEET });

    await line(spec, { sheet: 'Sales', axis: 'row', at: 5, by: -1 }, port);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: Region\n`);
  });

  it('asks first where it moves more than a handful, with the count in the question', async () => {
    const many = Array.from({ length: 30 }, (_, one) => `      A${one + 2}: ${one}\n`).join('');
    const { spec, port, refusals, answers, files } = editor({
      [ROOT]: `${SALES}    cells:\n${many}`,
    });
    const asked = { sheet: 'Sales', axis: 'row', at: 2, by: 1 } as const;

    await line(spec, asked, port);
    expect(refusals[0]).toContain('30 things, all of them `cells:` keys');
    expect(refusals[0]).toContain('a `data:` table keeps its addresses in one place');
    expect(files[ROOT]).toBe(`${SALES}    cells:\n${many}`);

    await line(spec, asked, port, answers[0]?.[0]?.id);
    expect(files[ROOT]).toContain('      A32: 29\n');
  });

  it('says why it will not, rather than saying nothing moves', async () => {
    const spec = `${SALES}    cells:\n      A5: 2\n      B1: { formula: "A5*2" }\n`;
    const { spec: read, port, refusals } = editor({ [ROOT]: spec });

    await line(read, { sheet: 'Sales', axis: 'row', at: 5, by: -1 }, port);
    expect(refusals[0]).toBe('`B1` holds `=A5*2`, and `A5` names a row this would take away');
  });

  it('says so where nothing it reaches moves', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: SHEET });

    await line(spec, { sheet: 'Sales', axis: 'row', at: 40, by: 1 }, port);
    expect(refusals[0]).toBe('nothing here moves when row 40 is drawn');
  });
});

describe('columns grouped from the preview', () => {
  it('writes the level on a band of their own, and says so', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const { spec: read, port, files, told } = editor({ [ROOT]: spec });

    await group(read, { sheet: 'Sales', axis: 'column', first: 2, last: 4, level: 1 }, port);

    expect(files[ROOT]).toBe(`${spec}    columns:\n      - at: B-D\n        group: 1\n`);
    expect(told).toEqual(['columns B-D grouped.']);
  });

  it('collapses by hiding the run, which is what the schema calls a collapsed group', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n    columns:\n      - at: B-D\n        group: 1\n`;
    const { spec: read, port, files } = editor({ [ROOT]: spec });

    await hide(read, { sheet: 'Sales', axis: 'column', first: 2, last: 4, hidden: true }, port);
    expect(files[ROOT]).toContain('      - at: B-D\n        group: 1\n        hidden: true\n');
  });

  it('says so where nothing groups them', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: `${SALES}    cells:\n      A1: 1\n` });

    await group(spec, { sheet: 'Sales', axis: 'column', first: 2, last: 4, level: 0 }, port);
    expect(refusals[0]).toContain('nothing groups columns B-D');
  });
});

describe('a sheet frozen from the preview', () => {
  const frozen = (of: Partial<Frozen> = {}): Frozen => ({
    sheet: 'Sales',
    at: { row: 2, col: 2 },
    ...of,
  });

  it('writes the key on the sheet, and says so', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n`;
    const { spec: read, port, files, told } = editor({ [ROOT]: spec });

    await freeze(read, frozen(), port);
    expect(files[ROOT]).toBe(`${spec}    freeze: B2\n`);
    expect(told).toEqual(['Sales is frozen at B2.']);
  });

  it('takes the key out again where the reader asks for no freeze', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n    freeze: B2\n`;
    const { spec: read, port, files, told } = editor({ [ROOT]: spec });

    await freeze(read, frozen({ at: null }), port);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: 1\n`);
    expect(told).toEqual(['Sales is no longer frozen.']);
  });

  it('refuses a sheet that is split, rather than taking the split off', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n    split: { x: 120, y: 60 }\n`;
    const { spec: read, port, files, refusals } = editor({ [ROOT]: spec });

    await freeze(read, frozen(), port);
    expect(refusals[0]).toContain('cannot have both');
    expect(files[ROOT]).toBe(spec);
  });

  it('refuses a sheet name no sheet can have', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: `${SALES}    cells:\n      A1: 1\n` });

    await freeze(spec, frozen({ sheet: '' }), port);
    expect(refusals[0]).toContain('is not a name a sheet can have');
  });
});

describe('a look asked for over the grid', () => {
  const BOLD = { 'font.bold': true } as const;
  const worn = (of: Partial<Worn> = {}): Worn => ({
    sheet: 'Sales',
    top: 1,
    left: 1,
    bottom: 1,
    right: 1,
    whole: null,
    want: BOLD,
    ...of,
  });

  it('lands without asking where nothing else says how the cell looks', async () => {
    const { spec, port, files, told } = editor({ [ROOT]: `${SALES}    cells:\n      A1: 1\n` });

    await wear(spec, worn(), port);
    expect(files[ROOT]).toContain('A1: { value: 1, style: { font: { bold: true } } }');
    expect(told).toEqual(['1 cell restyled.']);
  });

  it('writes a colour picked over a cell that had none', async () => {
    const { spec, port, files, told } = editor({ [ROOT]: `${SALES}    cells:\n      A1: 1\n` });

    await wear(spec, worn({ want: { fill: parseColor('1F3864') } }), port);
    expect(files[ROOT]).toContain('A1: { value: 1, style: { fill: "1F3864" } }');
    expect(told).toEqual(['1 cell restyled.']);
  });

  it('takes one off again, leaving the cell as it was written', async () => {
    const plain = `${SALES}    cells:\n      A1: 1\n`;
    const spec = `${SALES}    cells:\n      A1: { value: 1, style: { fill: "1F3864" } }\n`;
    const { spec: read, port, files } = editor({ [ROOT]: spec });

    await wear(read, worn({ want: { fill: null } }), port);
    expect(files[ROOT]).toBe(plain);
  });

  it('asks between the band a colour comes from and the one cell that refuses it', async () => {
    const spec = `${SALES}    columns:\n      - { at: A, style: { fill: "FFF2CC" } }\n    cells:\n      A1: 1\n`;
    const { spec: read, port, answers, files } = editor({ [ROOT]: spec });

    await wear(read, worn({ want: { fill: null } }), port);
    expect(answers[0]?.map((one) => one.id)).toEqual(['band', 'onCells']);
    expect(files[ROOT]).toBe(spec);
  });

  it('writes the cell that refuses it where that is the answer picked', async () => {
    const spec = `${SALES}    columns:\n      - { at: A, style: { fill: "FFF2CC" } }\n    cells:\n      A1: 1\n`;
    const { spec: read, port, files, told } = editor({ [ROOT]: spec });

    await wear(read, worn({ want: { fill: null } }), port, 'onCells');
    expect(files[ROOT]).toContain('A1: { value: 1, style: { fill: null } }');
    expect(told).toEqual(['1 cell restyled.']);
  });

  it('asks where the look comes from a declaration other cells read', async () => {
    const spec = `defs:\n  styles:\n    header: { font: { bold: true } }\n${SALES}    cells:\n      A1: { value: 1, style: header }\n      A2: { value: 2, style: header }\n`;
    const { spec: read, port, answers, refusals } = editor({ [ROOT]: spec });

    await wear(read, worn({ want: { 'font.bold': false } }), port);
    expect(refusals[0]).toContain('more than one way to change it');
    expect(answers[0]?.map((one) => [one.id, one.moves])).toEqual([
      ['definition', 2],
      ['onCells', 1],
    ]);
  });

  it('writes the answer the reader picked, and says what it moved', async () => {
    const spec = `defs:\n  styles:\n    header: { font: { bold: true } }\n${SALES}    cells:\n      A1: { value: 1, style: header }\n      A2: { value: 2, style: header }\n`;
    const { spec: read, port, files, told } = editor({ [ROOT]: spec });

    await wear(read, worn({ want: { 'font.bold': false } }), port, 'definition');
    expect(files[ROOT]).toContain('header: { font: { bold: false } }');
    expect(told).toEqual(['2 cells restyled.']);
  });

  it('asks over a rectangle whose cells take the look from different places', async () => {
    const spec = `defs:\n  styles:\n    header: { font: { bold: true } }\n${SALES}    cells:\n      A1: { value: 1, style: header }\n      A2: 2\n`;
    const { spec: read, port, answers, refusals, files } = editor({ [ROOT]: spec });

    await wear(read, worn({ bottom: 2, want: { 'font.bold': false } }), port);
    expect(refusals[0]).toContain('take that look from different places');
    expect(answers[0]?.map((one) => one.id)).toEqual(['all', 'split']);
    expect(files[ROOT]).toBe(spec);
  });

  it('lands without asking where the answers would leave the file the same', async () => {
    const spec = `defs:\n  styles:\n    header: { font: { bold: true } }\n${SALES}    columns:\n      - { at: B, style: { font: { bold: true } } }\n    cells:\n      A1: { value: 1, style: header }\n      B1: 2\n      C1: 3\n`;
    const { spec: read, port, files, refusals, told } = editor({ [ROOT]: spec });

    await wear(read, worn({ right: 3 }), port);
    expect(refusals).toEqual([]);
    expect(files[ROOT]).toContain('C1: { value: 3, style: header }');
    expect(files[ROOT]).toContain('B1: 2\n');
    expect(told).toEqual(['3 cells restyled.']);
  });

  it('splits it by origin where that is the answer picked', async () => {
    const spec = `defs:\n  styles:\n    header: { font: { bold: true } }\n${SALES}    cells:\n      A1: { value: 1, style: header }\n      A2: 2\n`;
    const { spec: read, port, files, told } = editor({ [ROOT]: spec });

    await wear(read, worn({ bottom: 2, want: { 'font.bold': false } }), port, 'split');
    expect(files[ROOT]).toContain('header: { font: { bold: false } }');
    expect(told).toEqual(['2 cells restyled.']);
  });

  it('takes no answer it did not offer', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: `${SALES}    cells:\n      A1: 1\n` });

    await wear(spec, worn(), port, 'somethingElse');
    expect(refusals[0]).toContain('no longer one of the ways');
  });
});
