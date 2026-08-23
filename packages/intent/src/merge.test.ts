import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type FilePath, filePath, type Rect, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { reading } from './direct';
import { setMerged } from './merge';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);
const SALES = 'sheets:\n  - name: Sales\n';
const CELLS = '    cells:\n      A1: Title\n      B1: covered\n';

function files(source: string) {
  const includes: IncludeReader = (_from, path) => (path === ROOT ? { file: ROOT, source } : null);
  const { doc } = load(parse(source, { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return { doc, grid: compile(doc, { read: includes }), read: reading(() => source), includes };
}

const at = (top: number, left: number, bottom = top, right = left): Rect => ({
  top,
  left,
  bottom,
  right,
});

/** The merge written or taken out, through the checker — the file, or why not. */
function drawn(source: string, rect: Rect, merged: boolean): string {
  const { doc, grid, read } = files(source);
  const intent = setMerged({ doc, grid }, { sheet: 'Sales' as SheetName, rect, merged }, read);
  if (intent.kind === 'refused') return `refused: ${intent.why}`;
  if (intent.kind !== 'edit') throw new Error('a file was not written');

  const { includes } = files(source);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);

  return done.ok === false ? `refused: ${done.diagnostics[0]?.message ?? 'a surprise'}` : done.text;
}

describe('a rectangle drawn as one cell', () => {
  it('writes the key where the sheet has none, in the form the spec shows', () => {
    expect(drawn(`${SALES}${CELLS}`, at(1, 1, 1, 3), true)).toBe(
      `${SALES}${CELLS}    merges: [A1:C1]\n`,
    );
  });

  it('goes in beside the merges already there', () => {
    const spec = `${SALES}    merges: [A1:B1]\n${CELLS}`;

    expect(drawn(spec, at(3, 1, 3, 2), true)).toContain('merges: [A1:B1, A3:B3]');
  });

  it('leaves the covered cells where they are, since a merge only draws over them', () => {
    expect(drawn(`${SALES}${CELLS}`, at(1, 1, 1, 3), true)).toContain('B1: covered');
  });

  it('will not draw one cell as one cell', () => {
    expect(drawn(`${SALES}${CELLS}`, at(1, 1), true)).toBe(
      'refused: a merge is more than one cell, so there is nothing here to draw as one',
    );
  });

  it('will not cross a merge that is already there', () => {
    const spec = `${SALES}    merges: [A1:B1]\n${CELLS}`;

    expect(drawn(spec, at(1, 2, 1, 4), true)).toBe(
      'refused: `A1:B1` is already merged, and a merge may not cross another',
    );
  });
});

describe('a merge taken back apart', () => {
  it('takes the key with it where it was the only one', () => {
    const spec = `${SALES}    merges: [A1:C1]\n${CELLS}`;

    expect(drawn(spec, at(1, 2), false)).toBe(`${SALES}${CELLS}`);
  });

  it('takes only the one the selection touches, leaving the rest', () => {
    const spec = `${SALES}    merges: [A1:B1, A3:B3]\n${CELLS}`;

    expect(drawn(spec, at(3, 1), false)).toContain('merges: [A1:B1]');
  });

  it('takes every merge the selection reaches', () => {
    const spec = `${SALES}    merges: [A1:B1, A3:B3, A5:B5]\n${CELLS}`;

    expect(drawn(spec, at(1, 1, 3, 2), false)).toContain('merges: [A5:B5]');
  });

  it('says so where nothing here is merged', () => {
    expect(drawn(`${SALES}${CELLS}`, at(1, 1), false)).toBe('refused: nothing here is merged');
  });
});
