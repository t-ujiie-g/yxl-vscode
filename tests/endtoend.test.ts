import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { type CompiledGrid, cellAt, compile, resolve } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { asTable, drawLine, reading, setMerged, setSorted, setStyle } from '@yxl-vscode/intent';
import { load } from '@yxl-vscode/loader';
import { type A1Addr, type FilePath, filePath, type SheetName } from '@yxl-vscode/units';
import type { Typed } from '@yxl-vscode/webview/protocol';
import { describe, expect, it } from 'vitest';
import {
  applied,
  type Port,
  resolve as resolveWith,
  type Spec,
  write,
  writeOverride,
} from 'yxl-vscode/write';
import { includeReader, yxlExamples } from './corpus';
import { build, extract, oracleVersion, PINNED } from './oracle';

/** Tier 4: the write path the UI calls, then the compiler that ships, then what the workbook holds. */
const QUICKSTART = yxlExamples().find((one) => one.name === 'quickstart.yxl.yaml');
const WORKBOOK = yxlExamples().find((one) => one.name === 'workbook.yxl.yaml');

/** A copy of the whole cookbook — an `$include`d spec reads its neighbours — and the write path over it. */
function opened(sample: { path: string }) {
  const dir = mkdtempSync(join(tmpdir(), 'yxl-e2e-'));
  cpSync(dirname(sample.path), dir, { recursive: true });

  const root = filePath(join(dir, basename(sample.path))) ?? ('' as FilePath);
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
    kept: () => {},
    left: () => null,
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

/** The workbook the compiler makes of the edited spec, read back as a spec. */
function built(dir: string, root: FilePath): Spec {
  const book = join(dir, 'out.xlsx');
  const back = join(dir, 'back.yxl.yaml');

  build(root, book);
  extract(book, back);

  return read(filePath(back) ?? ('' as FilePath));
}

function cell(grid: CompiledGrid, sheet: string, at: string) {
  const found = grid.sheets.find((one) => one.name === (sheet as SheetName));
  return found === undefined ? null : cellAt(found, at as A1Addr);
}

const typed = (of: Partial<Typed>): Typed => ({ sheet: 'Sales', row: 1, col: 1, text: '', ...of });

const at = (row: number, col: number, bottom = row, right = col) => ({
  top: row,
  left: col,
  bottom,
  right,
});

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

    expect(cell(built(dir, root).grid, 'Sales', 'A2')?.value).toBe('LATAM');
  });

  it('carries a typed formula into the workbook, as a formula', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);

    await write(spec(), typed({ row: 5, col: 2, text: '=SUM(B2:B3)*2' }), port);
    expect(refusals).toEqual([]);

    // The formula, not the number it stood for: a workbook holding 8300000
    // would be this editor having computed something and written it (ADR-014).
    expect(cell(built(dir, root).grid, 'Sales', 'B5')?.formula).toBe('SUM(B2:B3)*2');
  });

  it('carries an override into the workbook, over the range that filled the cell', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);
    const at = typed({ row: 3, col: 3, text: '99' });

    // C2:C3 is one formula for two cells, so the override is the way through.
    await write(spec(), at, port);
    expect(refusals).toHaveLength(1);

    await writeOverride(spec(), at, 'the audit settled this row', port);
    expect(refusals).toHaveLength(1);

    const { grid } = built(dir, root);
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

    await resolveWith(spec(), at, 'rangeFormula', port);
    expect(refusals).toHaveLength(1);

    // The range stores one formula and the second cell holds it a row down,
    // which is Excel's shared formula surviving the build and the extract.
    const { grid } = built(dir, root);
    expect([cell(grid, 'Sales', 'C2')?.formula, cell(grid, 'Sales', 'C3')?.formula]).toEqual([
      'B2*0.1',
      'B3*0.1',
    ]);
  });

  it('carries a cell nothing had written into the workbook', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);

    // Typing into a blank cell has one meaning here, so it is written rather
    // than asked about — and the workbook is where that has to show.
    await write(spec(), typed({ row: 7, col: 1, text: 'Footnote' }), port);
    expect(refusals).toEqual([]);

    expect(cell(built(dir, root).grid, 'Sales', 'A7')?.value).toBe('Footnote');
  });

  it('empties a cell written in the flow form, keeping the format it wears', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);

    // `B4: { value: 0.085, format: "0.0%" }` — the expanded form as the spec's
    // own documentation writes it, on one line and inside brackets.
    await write(spec(), typed({ row: 4, col: 2, text: '' }), port);
    expect(refusals).toEqual([]);

    const { grid } = built(dir, root);
    expect(cell(grid, 'Sales', 'B4')?.value).toBeNull();
    expect(cell(grid, 'Sales', 'B4')?.format).toBe('0.0%');
  });

  it('writes a value back into a cell that was left holding only its format', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);
    const at = typed({ row: 4, col: 2, text: '' });

    // Emptied and written again: the cell is still a cell while it holds only
    // its number format, so typing into it is one change in one place.
    await write(spec(), at, port);
    await write(spec(), { ...at, text: '0.01' }, port);
    expect(refusals).toEqual([]);

    const { grid } = built(dir, root);
    expect(cell(grid, 'Sales', 'B4')?.value).toBe(0.01);
    expect(cell(grid, 'Sales', 'B4')?.format).toBe('0.0%');
  });

  it('carries a changed definition into every cell that reads it', async () => {
    if (!WORKBOOK) return;
    const { dir, root, port, spec, refusals } = opened(WORKBOOK);
    const at = typed({ sheet: 'Summary', row: 17, col: 2, text: '9999' });

    // `B17: { $ref: target_revenue }` in `sheets/summary.yaml`, reading a
    // definition in `defs.yaml`: the edit lands in neither the sheet's file nor
    // the one that was opened.
    await write(spec(), at, port);
    expect(refusals).toHaveLength(1);

    await resolveWith(spec(), at, 'definition', port);
    expect(refusals).toHaveLength(1);

    expect(readFileSync(join(dir, 'workbook', 'defs.yaml'), 'utf8')).toContain(
      'target_revenue: 9999',
    );

    // The workbook holds it as Excel does: a defined name, and a cell that
    // reads it (`docs/spec.md` §6), which is the point of the definition
    // answer — the sharing survives the edit.
    const after = built(dir, root);
    expect(after.doc.defs.values.find((one) => one.name === 'target_revenue')?.value).toBe(9999);
    expect(cell(after.grid, 'Summary', 'B17')?.formula).toBe('target_revenue');
  });

  it('carries a changed parameter default into the workbook it builds', async () => {
    const sample = yxlExamples().find((one) => one.name === 'parameters.yxl.yaml');
    if (!sample) return;

    const { dir, root, port, spec, refusals } = opened(sample);
    // `B4: "${quarter}"` on the sheet `"${region}"`, which is drawn as APAC.
    const at = typed({ sheet: 'APAC', row: 4, col: 2, text: 'Q4' });

    await write(spec(), at, port);
    expect(refusals).toHaveLength(1);

    await resolveWith(spec(), at, 'parameter', port);
    expect(refusals).toHaveLength(1);

    const { grid } = built(dir, root);
    expect(cell(grid, 'APAC', 'B4')?.value).toBe('Q4');
    // The title reads the same parameter, so the workbook follows it there too.
    expect(cell(grid, 'APAC', 'A1')?.value).toBe('Q4 APAC summary');
  });

  it('carries a value into the CSV the cell reads, and into the workbook', async () => {
    if (!WORKBOOK) return;
    const { dir, root, port, spec, refusals } = opened(WORKBOOK);
    // `Masters!B2` is the second field of the first row of `stores.csv`.
    const at = typed({ sheet: 'Masters', row: 2, col: 2, text: 'Shinjuku West' });

    await write(spec(), at, port);
    expect(refusals).toHaveLength(1);

    await resolveWith(spec(), at, 'dataFile', port);
    expect(refusals).toHaveLength(1);

    const csv = readFileSync(join(dir, 'workbook', 'masters', 'stores.csv'), 'utf8');
    expect(csv.split('\n')[0]).toBe('S001,Shinjuku West,East');
    expect(cell(built(dir, root).grid, 'Masters', 'B2')?.value).toBe('Shinjuku West');
  });

  it('carries a look on a cell a data block fills, and leaves the value where it is', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);

    // A9 is the corner of an inline `data:` block, which carries no formatting
    // of its own (`docs/spec.md` §9): the look goes in a `cells:` entry beside
    // it, and the value stays where the block writes it.
    const where = { sheet: 'Sales' as SheetName, rect: at(9, 1), whole: null };
    const [answer] = setStyle(spec(), where, { 'font.bold': true }, reading(port.text));
    if (answer === undefined) throw new Error('nothing was offered');

    await applied(spec(), answer.intent, port, { anyway: false, from: answer.id, about: null });
    expect(refusals).toEqual([]);

    const { grid } = built(dir, root);
    expect(cell(grid, 'Sales', 'A9')?.value).toBe('Quarter');
    expect(resolve(cell(grid, 'Sales', 'A9')?.style ?? [])['font.bold']).toBe(true);
  });

  it('carries a look inside a filled range as an exception, and keeps the formula', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);

    // C2:C3 is one formula for two cells, and no `cells:` entry may overlap a
    // range (`docs/spec.md` §3), so the look is an exception (§23).
    const where = { sheet: 'Sales' as SheetName, rect: at(3, 3), whole: null };
    const answers = setStyle(spec(), where, { 'font.bold': true }, reading(port.text));
    const taken = answers.find((one) => one.id === 'exception');
    if (taken === undefined) throw new Error('the exception was not offered');

    await applied(spec(), taken.intent, port, { anyway: false, from: taken.id, about: null });
    expect(refusals).toEqual([]);

    const { grid } = built(dir, root);
    expect(cell(grid, 'Sales', 'C3')?.formula).toBe('B3*0.05');
    expect(resolve(cell(grid, 'Sales', 'C3')?.style ?? [])['font.bold']).toBe(true);
  });

  it('puts a row into the workbook, moving what is under it and what names it', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);

    // Above `A5: Total` and its `SUM(B2:B3)`, and above the `data:` block at A9.
    const intent = drawLine(
      spec(),
      { sheet: 'Sales' as SheetName, axis: 'row', at: 3, by: 1 },
      reading(port.text),
    );
    await applied(spec(), intent, port, { anyway: false, from: 'line', about: null });
    expect(refusals).toEqual([]);

    const { grid } = built(dir, root);
    expect(cell(grid, 'Sales', 'A3')).toBeNull();
    expect(cell(grid, 'Sales', 'A4')?.value).toBe('EMEA');
    expect(cell(grid, 'Sales', 'B6')?.formula).toBe('SUM(B2:B4)');
    expect(cell(grid, 'Sales', 'A10')?.value).toBe('Quarter');
    expect(cell(grid, 'Sales', 'C4')?.formula).toBe('B4*0.05');
  });

  it('carries a merge into the workbook, keeping the cell it covers', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);
    const where = { sheet: 'Sales' as SheetName, rect: at(1, 1, 1, 3), merged: true };

    const intent = setMerged(spec(), where, reading(port.text));
    await applied(spec(), intent, port, { anyway: false, from: 'merge', about: null });
    expect(refusals).toEqual([]);

    // The merge draws over B1; the spec keeps it, which is what makes the
    // gesture its own inverse.
    const { grid } = built(dir, root);
    expect(cell(grid, 'Sales', 'A1')?.value).toBe('Region');
    expect(cell(grid, 'Sales', 'B1')?.value).toBe('Revenue');
  });

  it('keeps a rectangle as a table without moving a cell of it', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);

    // A2:B3 is `APAC 2400000` over `EMEA 1750000`, four plain `cells:` entries.
    const intent = asTable(
      spec(),
      { sheet: 'Sales' as SheetName, rect: at(2, 1, 3, 2) },
      reading(port.text),
    );
    await applied(spec(), intent, port, { anyway: false, from: 'table', about: null });
    expect(refusals).toEqual([]);

    const { grid } = built(dir, root);
    expect(cell(grid, 'Sales', 'A2')?.value).toBe('APAC');
    expect(cell(grid, 'Sales', 'B3')?.value).toBe(1750000);
    expect(cell(grid, 'Sales', 'B5')?.formula).toBe('SUM(B2:B3)');
  });

  it('puts a table’s rows in order without touching anything else', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);

    // The block at A9 is `Quarter/Bookings` then Q1, Q2, Q3 — sort rows 10-12
    // by the bookings column, largest first, and leave the header where it is.
    const where = { sheet: 'Sales' as SheetName, rect: at(10, 2, 12, 2), down: true };
    await applied(spec(), setSorted(spec(), where, reading(port.text)), port, {
      anyway: false,
      from: 'sort',
      about: null,
    });
    expect(refusals).toEqual([]);

    const { grid } = built(dir, root);
    expect(cell(grid, 'Sales', 'A9')?.value).toBe('Quarter');
    expect(cell(grid, 'Sales', 'A10')?.value).toBe('Q3');
    expect(cell(grid, 'Sales', 'B10')?.value).toBe(1300000);
    expect(cell(grid, 'Sales', 'A12')?.value).toBe('Q1');
  });

  it('takes a cell back out of the workbook when it is emptied', async () => {
    if (!QUICKSTART) return;
    const { dir, root, port, spec, refusals } = opened(QUICKSTART);

    await write(spec(), typed({ row: 7, col: 1, text: 'Footnote' }), port);
    // Emptying it is not writing nothing into it: a cell with nothing in it is
    // not something the format can say (`docs/spec.md` §3), so the entry goes.
    await write(spec(), typed({ row: 7, col: 1, text: '' }), port);
    expect(refusals).toEqual([]);

    expect(cell(built(dir, root).grid, 'Sales', 'A7')).toBeNull();
  });
});
