import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type FilePath, filePath } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { type Port, type Spec, type Typed, write } from './write';

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

  const spec: Spec = { root: ROOT, grid: compile(doc, { read }), read, params: new Map() };
  const port: Port = {
    text: (file) => files[file] ?? null,
    put: (file, text) => {
      files[file] = text;
    },
    refuse: (why) => {
      refusals.push(why);
    },
  };

  return { spec, port, files, refusals };
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
