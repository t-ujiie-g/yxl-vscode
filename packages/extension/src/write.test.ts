import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type FilePath, filePath } from '@yxl-vscode/units';
import type { Choice, Typed } from '@yxl-vscode/webview/protocol';
import { describe, expect, it } from 'vitest';
import { type Port, resolve, type Spec, write, writeOverride } from './write';

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
  const port: Port = {
    text: (file) => files[file] ?? null,
    put: (file, text) => {
      files[file] = text;
    },
    refuse: (why, offer) => {
      refusals.push(why);
      offers.push(offer?.canOverride === true ? offer.typed : null);
      answers.push([...(offer?.choices ?? [])]);
    },
    said: (what) => {
      told.push(what);
    },
  };

  return { spec, port, files, refusals, offers, answers, told };
}

const typed = (of: Partial<Typed> = {}): Typed => ({
  sheet: 'Sales',
  row: 1,
  col: 1,
  text: 'EMEA',
  ...of,
});

const SALES = 'sheets:\n  - name: Sales\n';

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
      ['', 'B1:'],
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
    const { spec, port, offers } = editor({ [ROOT]: `${SALES}    cells:\n      A1: 1\n` });

    await write(spec, typed({ col: 26, row: 99 }), port);
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

  it('offers to write it, with no override beside it', async () => {
    // An override must have something to override (`docs/spec.md` §23), and an
    // empty address has nothing — so the answer is the only offer.
    const { spec, port, answers, offers } = editor({
      [ROOT]: `${SALES}    cells:\n      A1: APAC\n`,
    });

    await write(spec, at, port);
    expect(answers[0]).toEqual([
      { id: 'newCell', what: 'Write `A5` as a new cell', moves: 1, sample: ['A5'] },
    ]);
    expect(offers[0]).toBeNull();
  });

  it('writes it where the sheet keeps its cells', async () => {
    const { spec, port, files } = editor({ [ROOT]: `${SALES}    cells:\n      A1: APAC\n` });

    await resolve(spec, at, 'newCell', port);
    expect(files[ROOT]).toBe(`${SALES}    cells:\n      A1: APAC\n      A5: Total\n`);
  });
});
