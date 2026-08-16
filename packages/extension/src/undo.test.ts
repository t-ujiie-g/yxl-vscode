import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { did, type History, nothing } from '@yxl-vscode/patch';
import { type FilePath, filePath } from '@yxl-vscode/units';
import type { Choice, Typed } from '@yxl-vscode/webview/protocol';
import { describe, expect, it } from 'vitest';
import { goBack } from './undo';
import { type Port, resolve, type Spec, write } from './write';

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

const typed = (of: Partial<Typed> = {}): Typed => ({
  sheet: 'Sales',
  row: 1,
  col: 1,
  text: 'EMEA',
  ...of,
});

const SALES = 'sheets:\n  - name: Sales\n';

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
