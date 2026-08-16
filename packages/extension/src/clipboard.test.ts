import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { did, type History, nothing } from '@yxl-vscode/patch';
import { type FilePath, filePath } from '@yxl-vscode/units';
import type { Choice, Typed } from '@yxl-vscode/webview/protocol';
import { describe, expect, it } from 'vitest';
import { paste, pastedWith, pasteFrom, whose } from './clipboard';
import { goBack } from './undo';
import type { Port, Spec } from './write';

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
      offers.push(
        offer?.canOverride === true && offer.about?.is === 'typed' ? offer.about.typed : null,
      );
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

const SALES = 'sheets:\n  - name: Sales\n';

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
