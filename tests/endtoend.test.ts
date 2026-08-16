import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CompiledGrid, cellAt, compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import { type A1Addr, type FilePath, filePath, type SheetName } from '@yxl-vscode/units';
import type { Typed } from '@yxl-vscode/webview/protocol';
import { describe, expect, it } from 'vitest';
import { type Port, resolve, type Spec, write, writeOverride } from 'yxl-vscode/write';
import { includeReader, yxlExamples } from './corpus';
import { build, extract, oracleVersion, PINNED } from './oracle';

/**
 * The end-to-end tier: a real spec, the write path the UI calls, and the
 * compiler that ships.
 *
 * Every other tier stops at the spec — they prove the file changed the way the
 * edit said it would. This one asks whether the **workbook** ends up holding
 * what the reader typed, and it is the only one where the compiler runs for
 * real rather than as a validator.
 */
const QUICKSTART = yxlExamples().find((one) => one.name === 'quickstart.yxl.yaml');

/** A copy of a spec, alone in a directory of its own, and the write path over it. */
function opened(sample: { path: string }) {
  const dir = mkdtempSync(join(tmpdir(), 'yxl-e2e-'));
  const path = join(dir, 'spec.yxl.yaml');
  copyFileSync(sample.path, path);

  const root = filePath(path) ?? ('' as FilePath);
  const refusals: string[] = [];
  const port: Port = {
    text: (file) => {
      try {
        return readFileSync(file, 'utf8');
      } catch {
        return null;
      }
    },
    put: (file, text) => writeFileSync(file, text),
    refuse: (why) => {
      refusals.push(why);
    },
    said: () => {},
  };

  return { dir, root, port, refusals, spec: () => read(root) };
}

function read(root: FilePath): Spec {
  const { doc } = load(parse(readFileSync(root, 'utf8'), { file: root }), includeReader);
  if (doc === null) throw new Error(`${root} did not load`);

  return {
    root,
    doc,
    grid: compile(doc, { read: includeReader }),
    read: includeReader,
    params: new Map(),
  };
}

/** The workbook the compiler makes of the edited spec, as a grid again. */
function built(dir: string, root: FilePath): CompiledGrid {
  const book = join(dir, 'out.xlsx');
  const back = join(dir, 'back.yxl.yaml');

  build(root, book);
  extract(book, back);

  return read(filePath(back) ?? ('' as FilePath)).grid;
}

function cell(grid: CompiledGrid, sheet: string, at: string) {
  const found = grid.sheets.find((one) => one.name === (sheet as SheetName));
  return found === undefined ? null : cellAt(found, at as A1Addr);
}

const typed = (of: Partial<Typed>): Typed => ({ sheet: 'Sales', row: 1, col: 1, text: '', ...of });

describe('the loop, closed', () => {
  it('has the pinned compiler to close it with', () => {
    expect(oracleVersion(), `install yxl ${PINNED}, or point YXL_BIN at it`).toBe(PINNED);
    expect(
      QUICKSTART,
      'the yxl checkout next door is where the real spec comes from',
    ).toBeDefined();
  });

  it('carries a typed value into the workbook', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);

    await write(spec(), typed({ row: 2, col: 1, text: 'LATAM' }), port);
    expect(refusals).toEqual([]);

    expect(cell(built(dir, root), 'Sales', 'A2')?.value).toBe('LATAM');
  });

  it('carries a typed formula into the workbook, as a formula', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);

    await write(spec(), typed({ row: 5, col: 2, text: '=SUM(B2:B3)*2' }), port);
    expect(refusals).toEqual([]);

    // The formula, not the number it stood for: a workbook holding 8300000
    // would be this editor having computed something and written it (ADR-014).
    expect(cell(built(dir, root), 'Sales', 'B5')?.formula).toBe('SUM(B2:B3)*2');
  });

  it('carries an override into the workbook, over the range that filled the cell', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);
    const at = typed({ row: 3, col: 3, text: '99' });

    // C2:C3 is one formula filling two cells, so the ordinary edit is refused
    // and `overrides:` is the way through (ADR-007). What the workbook holds is
    // the only proof that the exception really excepts.
    await write(spec(), at, port);
    expect(refusals).toHaveLength(1);

    await writeOverride(spec(), at, 'the audit settled this row', port);
    expect(refusals).toHaveLength(1);

    const grid = built(dir, root);
    expect(cell(grid, 'Sales', 'C3')?.value).toBe(99);
    expect(cell(grid, 'Sales', 'C2')?.formula).toBe('B2*0.05');
  });

  it('carries a resolved range formula into every cell the range fills', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);
    const at = typed({ row: 2, col: 3, text: '=B2*0.1' });

    // C2:C3 is one formula for two cells, so the edit has an answer rather than
    // a single meaning: change the range, and both cells follow it.
    await write(spec(), at, port);
    expect(refusals).toHaveLength(1);

    await resolve(spec(), at, 'rangeFormula', port);
    expect(refusals).toHaveLength(1);

    const grid = built(dir, root);
    expect([cell(grid, 'Sales', 'C2')?.formula, cell(grid, 'Sales', 'C3')?.formula]).toEqual([
      'B2*0.1',
      'B2*0.1',
    ]);
  });
});
