import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type FilePath, filePath, type Rect, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { reading } from './direct';
import { setFilter } from './filter';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);

function files(source: string) {
  const includes: IncludeReader = (_from, path) => (path === ROOT ? { file: ROOT, source } : null);
  const { doc } = load(parse(source, { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return { doc, grid: compile(doc, { read: includes }), read: reading(() => source), includes };
}

/** The filter set, through the checker — the file, or why not. */
function filtered(source: string, rect: Rect | null): string {
  const { doc, grid, read } = files(source);
  const intent = setFilter({ doc, grid }, { sheet: 'S' as SheetName, rect }, read);
  if (intent.kind === 'refused') return `refused: ${intent.why}`;
  if (intent.kind !== 'edit') throw new Error('a file was not written');

  const { includes } = files(source);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);

  return done.ok === false ? `refused: ${done.diagnostics[0]?.message ?? 'a surprise'}` : done.text;
}

const SHEET = 'sheets:\n  - name: S\n    cells:\n      A1: Region\n';

describe('a sheet auto filter', () => {
  it('is written as the top row of the rectangle, which is the header Excel reads', () => {
    expect(filtered(SHEET, { top: 1, left: 1, bottom: 9, right: 4 })).toBe(
      `${SHEET}    filter: A1:D1\n`,
    );
  });

  it('replaces the one the sheet has, since a sheet has one filter', () => {
    const already = `${SHEET}    filter: A1:B1\n`;
    expect(filtered(already, { top: 2, left: 1, bottom: 2, right: 3 })).toBe(
      `${SHEET}    filter: A2:C2\n`,
    );
  });

  it('is taken off by the key going, and refused where there is none to take off', () => {
    const already = `${SHEET}    filter: A1:B1\n`;
    expect(filtered(already, null)).toBe(SHEET);
    expect(filtered(SHEET, null)).toBe('refused: `S` has no filter to take off');
  });
});
