import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { did, type History, nothing } from '@yxl-vscode/patch';
import { type FilePath, filePath } from '@yxl-vscode/units';
import type { Choice, Typed } from '@yxl-vscode/webview/protocol';
import { describe, expect, it } from 'vitest';
import {
  emptied,
  empty,
  goBack,
  type Port,
  paste,
  pastedWith,
  pasteFrom,
  resolve,
  type Spec,
  whose,
  write,
  writeOverride,
} from './write';

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
      offers.push(offer?.canOverride === true ? offer.typed : null);
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

/** The grid's undo, as the preview runs it: the history in, the history it left back out. */
async function back(
  editing: ReturnType<typeof editor>,
  redoing = false,
): Promise<'here' | 'shell' | 'nowhere'> {
  const taken = await goBack(editing.spec, editing.stack.history, redoing, editing.port);
  editing.stack.history = taken.history;

  return taken.at;
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
    expect(offers[0]).toEqual(typed({ col: 2, row: 2, text: '99' }));
  });

  it('is offered as what was typed, and not as the message that carried it', async () => {
    // What arrives at a write is a *message*, and a message carries its own
    // `kind`. Handing that back for the view to send again is how an override
    // went out as an edit and came back refused by the rule it excepted.
    const { spec, port, offers } = editor({ [ROOT]: FILLED });
    const message = { ...typed({ col: 2, row: 2, text: '99' }), kind: 'edit' } as Typed;

    await write(spec, message, port);
    expect(offers[0]).not.toHaveProperty('kind');
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
    ]);
    expect(offers[0]).toBeNull();
    expect(files[ROOT]).toBe(BESIDE_DATA);
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

describe('an edit taken back where this editor still holds the file', () => {
  const ONE = `${SALES}    cells:\n      A1: APAC\n`;

  it('puts the file back byte for byte', async () => {
    const editing = editor({ [ROOT]: ONE });
    await write(editing.spec, typed(), editing.port);

    expect(await back(editing)).toBe('here');
    expect(editing.files[ROOT]).toBe(ONE);
  });

  it('takes them back one at a time, last first', async () => {
    const both = `${SALES}    cells:\n      A1: APAC\n      B1: 1\n`;
    const editing = editor({ [ROOT]: both });
    await write(editing.spec, typed(), editing.port);
    await write(editing.spec, typed({ col: 2, text: '2' }), editing.port);

    expect(await back(editing)).toBe('here');
    expect(editing.files[ROOT]).toBe(`${SALES}    cells:\n      A1: EMEA\n      B1: 1\n`);

    expect(await back(editing)).toBe('here');
    expect(editing.files[ROOT]).toBe(both);
  });

  it('puts an undone edit back on, and takes it back again', async () => {
    const editing = editor({ [ROOT]: ONE });
    await write(editing.spec, typed(), editing.port);
    await back(editing);

    expect(await back(editing, true)).toBe('here');
    expect(editing.files[ROOT]).toContain('A1: EMEA');

    expect(await back(editing)).toBe('here');
    expect(editing.files[ROOT]).toBe(ONE);
  });

  it('takes back an edit that landed in an `$include`d file', async () => {
    const included = 'name: Sales\ncells:\n  A1: APAC\n';
    const editing = editor({
      [ROOT]: 'sheets:\n  - $include: sales.yaml\n',
      '/specs/sales.yaml': included,
    });
    await write(editing.spec, typed(), editing.port);

    expect(await back(editing)).toBe('here');
    expect(editing.files['/specs/sales.yaml']).toBe(included);
  });
});

describe('an edit this editor no longer holds', () => {
  const ONE = `${SALES}    cells:\n      A1: APAC\n`;

  it('goes to the editor’s own stack where the file moved since', async () => {
    const editing = editor({ [ROOT]: ONE });
    await write(editing.spec, typed(), editing.port);
    editing.files[ROOT] = `${SALES}    cells:\n      A1: EMEA\n      B1: 1\n`;

    expect(await back(editing)).toBe('shell');
    expect(editing.files[ROOT]).toContain('B1: 1');
  });

  it('goes there before this editor has written anything', async () => {
    const editing = editor({ [ROOT]: ONE });

    expect(await back(editing)).toBe('shell');
    expect(await back(editing, true)).toBe('shell');
  });

  it('goes there where the spec no longer reads, and writes nothing', async () => {
    const editing = editor({
      [ROOT]: 'sheets:\n  - $include: sales.yaml\n',
      '/specs/sales.yaml': 'name: Sales\ncells:\n  A1: APAC\n',
    });
    await write(editing.spec, typed(), editing.port);
    editing.files[ROOT] = '- not a spec\n';

    expect(await back(editing)).toBe('shell');
    expect(editing.files['/specs/sales.yaml']).toContain('A1: EMEA');
  });

  it('forgets what it did once it makes an edit it cannot take back', async () => {
    const reads = `${SALES}    cells:\n      C1: keep\n    data:\n      - at: A1\n        csv: rows.csv\n`;
    const editing = editor({ [ROOT]: reads, '/specs/rows.csv': 'APAC,1\nEMEA,2\n' });
    await write(editing.spec, typed({ col: 3, text: 'kept' }), editing.port);
    await resolve(editing.spec, typed({ row: 2, text: 'LATAM' }), 'dataFile', editing.port);

    expect(editing.files['/specs/rows.csv']).toBe('APAC,1\nLATAM,2\n');
    expect(editing.stack.history).toEqual(nothing);
    expect(await back(editing)).toBe('shell');
  });
});

describe('an undo this editor has already spent', () => {
  const ONE = `${SALES}    cells:\n      A1: APAC\n`;

  it('says so rather than reaching for a stack it has unwound itself', async () => {
    const editing = editor({ [ROOT]: ONE });
    await write(editing.spec, typed(), editing.port);
    await back(editing);

    expect(await back(editing)).toBe('nowhere');
    expect(editing.files[ROOT]).toBe(ONE);
  });

  it('has nothing to put on again while its own last edit still stands', async () => {
    const editing = editor({ [ROOT]: ONE });
    await write(editing.spec, typed(), editing.port);

    expect(await back(editing, true)).toBe('nowhere');
  });
});

describe('a rectangle put down somewhere else', () => {
  const GRID = `${SALES}    cells:\n      A1: 1\n      A2: 2\n      C1: keep\n`;
  const from = { sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 1 };

  it('writes every cell of it in one edit, and says how many', async () => {
    const { spec, port, files, told } = editor({ [ROOT]: GRID });

    await paste(spec, { from, sheet: 'Sales', row: 1, col: 2, cut: false }, port);
    expect(files[ROOT]).toBe(
      `${SALES}    cells:\n      A1: 1\n      A2: 2\n      C1: keep\n      B1: 1\n      B2: 2\n`,
    );
    expect(told).toEqual(['2 cells pasted.']);
  });

  it('empties what a cut took, and says the cells moved', async () => {
    const { spec, port, files, told } = editor({ [ROOT]: GRID });

    await paste(spec, { from, sheet: 'Sales', row: 1, col: 2, cut: true }, port);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      C1: keep\n      B1: 1\n      B2: 2\n`);
    expect(told).toEqual(['4 cells moved.']);
  });

  it('takes a formula with it, with the references it holds moved', async () => {
    const spec = `${SALES}    cells:\n      A1: 2\n      A2: 3\n      B1: { formula: "A1*10" }\n`;
    const { spec: read, port, files } = editor({ [ROOT]: spec });

    await paste(
      read,
      {
        from: { ...from, top: 1, bottom: 1, left: 2, right: 2 },
        sheet: 'Sales',
        row: 2,
        col: 2,
        cut: false,
      },
      port,
    );
    expect(files[ROOT]).toContain('B2:\n        formula: "A2*10"');
  });

  it('offers to paste into the ones that can take it', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      A2: 2\n      B2: 0\n    formulas:\n      - at: B1:B1\n        formula: "A1"\n`;
    const { spec: read, port, answers } = editor({ [ROOT]: spec });

    await paste(read, { from, sheet: 'Sales', row: 1, col: 2, cut: false }, port);
    expect(answers[0]).toEqual([
      { id: 'only', what: 'Paste into the ones that can take it', moves: 1, sample: ['Sales!B2'] },
    ]);
  });

  it('pastes into those and leaves the rest where the reader takes that answer', async () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      A2: 2\n      B2: 0\n    formulas:\n      - at: B1:B1\n        formula: "A1"\n`;
    const { spec: read, port, files, refusals } = editor({ [ROOT]: spec });

    await pastedWith(read, { from, sheet: 'Sales', row: 1, col: 2, cut: false }, 'only', port);
    expect(refusals).toEqual([]);
    expect(files[ROOT]).toContain('B2: 2');
  });

  it('takes no answer it did not offer', async () => {
    const { spec, port, files, refusals } = editor({ [ROOT]: GRID });

    await pastedWith(spec, { from, sheet: 'Sales', row: 1, col: 2, cut: false }, 'anything', port);
    expect(files[ROOT]).toBe(GRID);
    expect(refusals[0]).toContain('no longer one of the ways');
  });

  it('refuses a sheet name no sheet can have', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: GRID });

    await paste(
      spec,
      { from: { ...from, sheet: '' }, sheet: 'Sales', row: 1, col: 2, cut: false },
      port,
    );
    expect(refusals[0]).toContain('is not a name a sheet can have');
  });

  it('can be taken back in place, like every other edit', async () => {
    const editing = editor({ [ROOT]: GRID });

    await paste(editing.spec, { from, sheet: 'Sales', row: 1, col: 2, cut: true }, editing.port);
    expect(await back(editing)).toBe('here');
    expect(editing.files[ROOT]).toBe(GRID);
  });
});

describe('a rectangle from another spreadsheet', () => {
  const SHEET = `${SALES}    cells:\n      A1: keep\n`;
  const at = (row: number, col: number) => ({ sheet: 'Sales', row, col });

  it('asks which shape it should land in, with the lines each would add', async () => {
    const { spec, port, answers, refusals, files } = editor({ [ROOT]: SHEET });

    await pasteFrom(spec, { ...at(1, 2), text: 'APAC\t1\nEMEA\t2' }, port);
    expect(refusals[0]).toBe('4 cells from the clipboard: how should they be written?');
    expect(answers[0]).toEqual([
      { id: 'data', what: 'As one `data:` block — 4 lines', moves: 4, sample: [] },
      { id: 'cells', what: 'As `cells:` entries — 4 lines', moves: 4, sample: [] },
    ]);
    expect(files[ROOT]).toBe(SHEET);
  });

  it('writes it as `cells:` entries where that is the answer', async () => {
    const { spec, port, files, told } = editor({ [ROOT]: SHEET });

    await pasteFrom(spec, { ...at(1, 2), text: 'APAC\t1' }, port, 'cells');
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: keep\n      B1: APAC\n      C1: 1\n`);
    expect(told).toEqual(['2 cells pasted.']);
  });

  it('writes it as one `data:` block where that is the answer', async () => {
    const { spec, port, files } = editor({ [ROOT]: SHEET });

    await pasteFrom(spec, { ...at(1, 2), text: 'APAC\t1' }, port, 'data');
    expect(files[ROOT]).toContain(
      'data:\n      - at: B1\n        values:\n          - ["APAC", 1]',
    );
  });

  it('does not ask where only one shape is open to it', async () => {
    const { spec, port, files, refusals } = editor({ [ROOT]: SHEET });

    await pasteFrom(spec, { ...at(1, 1), text: 'LATAM' }, port);
    expect(refusals).toEqual([]);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: LATAM\n`);
  });

  it('takes no answer it did not offer', async () => {
    const { spec, port, files, refusals } = editor({ [ROOT]: SHEET });

    await pasteFrom(spec, { ...at(1, 2), text: 'APAC' }, port, 'anything');
    expect(files[ROOT]).toBe(SHEET);
    expect(refusals[0]).toContain('no longer one of the ways');
  });

  it('refuses an empty clipboard', async () => {
    const { spec, port, refusals } = editor({ [ROOT]: SHEET });

    await pasteFrom(spec, { ...at(1, 2), text: '' }, port);
    expect(refusals[0]).toContain('nothing on the clipboard');
  });

  it('offers to paste into the ones that can take it', async () => {
    const spec = `${SALES}    cells:\n      A1: keep\n    formulas:\n      - at: B1:B1\n        formula: "A1"\n`;
    const { spec: read, port, answers } = editor({ [ROOT]: spec });

    await pasteFrom(read, { ...at(1, 2), text: 'x\ty' }, port, 'cells');
    expect(answers[0]?.[0]?.what).toBe('Paste into the ones that can take it');
  });

  it('can be taken back in place, like every other edit', async () => {
    const editing = editor({ [ROOT]: SHEET });

    await pasteFrom(editing.spec, { ...at(1, 2), text: 'APAC\t1' }, editing.port, 'cells');
    expect(await back(editing)).toBe('here');
    expect(editing.files[ROOT]).toBe(SHEET);
  });
});

describe('whose paste `Cmd`+`V` is', () => {
  const rect = { sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 2 };
  const asked = { sheet: 'Sales', row: 5, col: 5, from: rect, cut: false, ours: 'APAC\t1' };

  it('is the grid’s own while the clipboard still holds what its copy put there', () => {
    expect(whose(asked, 'APAC\t1')).toEqual({
      is: 'grid',
      pasted: { from: rect, sheet: 'Sales', row: 5, col: 5, cut: false },
    });
  });

  it('is the clipboard’s once something else has been copied', () => {
    expect(whose(asked, 'LATAM\t9')).toEqual({
      is: 'clipboard',
      text: { text: 'LATAM\t9', sheet: 'Sales', row: 5, col: 5 },
    });
  });

  it('is the grid’s where the clipboard could not be read at all', () => {
    expect(whose(asked, '').is).toBe('grid');
  });

  it('is neither where the grid holds nothing and the clipboard is empty', () => {
    expect(whose({ ...asked, from: null, ours: null }, '')).toEqual({ is: 'neither' });
  });

  it('is the clipboard’s where the grid has copied nothing', () => {
    expect(whose({ ...asked, from: null, ours: null }, 'LATAM').is).toBe('clipboard');
  });

  it('carries the cut through, so one gesture empties what it took', () => {
    expect(whose({ ...asked, cut: true }, '')).toMatchObject({
      pasted: { cut: true },
    });
  });
});
