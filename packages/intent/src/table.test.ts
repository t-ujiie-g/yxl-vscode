import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type FilePath, filePath, type Rect, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { reading } from './direct';
import { asTable } from './table';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);
const SALES = 'sheets:\n  - name: Sales\n';

function files(source: string) {
  const includes: IncludeReader = (_from, path) => (path === ROOT ? { file: ROOT, source } : null);
  const { doc } = load(parse(source, { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return { doc, grid: compile(doc, { read: includes }), read: reading(() => source), includes };
}

const at = (top: number, left: number, bottom: number, right: number): Rect => ({
  top,
  left,
  bottom,
  right,
});

/** The rectangle made a table, through the checker — the file, or why not. */
function made(source: string, rect: Rect): string {
  const { doc, grid, read } = files(source);
  const intent = asTable({ doc, grid }, { sheet: 'Sales' as SheetName, rect }, read);
  if (intent.kind === 'refused') return `refused: ${intent.why}`;
  if (intent.kind !== 'edit') throw new Error('a file was not written');

  const { includes } = files(source);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);

  return done.ok === false ? `refused: ${done.diagnostics[0]?.message ?? 'a surprise'}` : done.text;
}

const ROWS = '    cells:\n      A1: APAC\n      B1: 2400000\n      A2: EMEA\n      B2: 1750000\n';

describe('a rectangle kept as a table instead', () => {
  it('writes the block anchored where the rectangle starts, and takes the keys away', () => {
    expect(made(`${SALES}${ROWS}`, at(1, 1, 2, 2))).toBe(
      `${SALES}    data:\n      - at: A1\n        values:\n          - [APAC, 2400000]\n          - [EMEA, 1750000]\n`,
    );
  });

  it('keeps each field exactly as the file wrote it, quotes and all', () => {
    const spec = `${SALES}    cells:\n      A1: "007"\n      B1: 1\n      A2: "008"\n      B2: 2\n`;

    expect(made(spec, at(1, 1, 2, 2))).toContain('          - ["007", 1]\n');
  });

  it('writes a gap as nothing at all, which is a cell the block does not fill', () => {
    const spec = `${SALES}    cells:\n      A1: APAC\n      A2: EMEA\n      B2: 2\n`;

    expect(made(spec, at(1, 1, 2, 2))).toContain('          - [APAC, null]\n');
  });

  it('leaves the cells outside it where they are', () => {
    const spec = `${SALES}${ROWS}      D9: kept\n`;
    const done = made(spec, at(1, 1, 2, 2));

    expect(done).toContain('      D9: kept\n');
    expect(done).not.toContain('A1: APAC');
  });

  it('goes in beside a table the sheet already has', () => {
    const spec = `${SALES}${ROWS}    data:\n      - at: D1\n        values:\n          - [held]\n`;
    const done = made(spec, at(1, 1, 2, 2));

    expect(done).toContain('      - at: D1\n');
    expect(done).toContain('      - at: A1\n        values:\n          - [APAC, 2400000]\n');
  });

  it('will not take a cell that says more than a value', () => {
    const spec = `${SALES}    cells:\n      A1: { value: APAC, style: { font: { bold: true } } }\n      A2: EMEA\n`;

    expect(made(spec, at(1, 1, 2, 1))).toBe(
      'refused: `A1` says more than a value, which a table has nowhere to keep',
    );
  });

  it('will not take a cell something else already writes', () => {
    const spec = `${SALES}    cells:\n      A2: EMEA\n    formulas:\n      - at: A1:A1\n        formula: "1*2"\n`;

    expect(made(spec, at(1, 1, 2, 1))).toBe(
      'refused: `A1` is not written as a cell of its own, so a table cannot take it over',
    );
  });

  it('will not make a table of one row, which is what cells are for', () => {
    expect(made(`${SALES}${ROWS}`, at(1, 1, 1, 2))).toBe(
      'refused: a table is more than one row, so there is nothing here to anchor',
    );
  });
});
