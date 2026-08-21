import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import {
  type A1Addr,
  type FilePath,
  filePath,
  parseA1Addr,
  type SheetName,
} from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { reading } from './direct';
import { setFreeze } from './freeze';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);
const SALES = 'sheets:\n  - name: Sales\n';
const CELLS = '    cells:\n      A1: 1\n';

function files(source: string) {
  const includes: IncludeReader = (_from, path) => (path === ROOT ? { file: ROOT, source } : null);

  const { doc } = load(parse(source, { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return { grid: compile(doc, { read: includes }), read: reading(() => source), includes };
}

/** What freezing at that cell — or unfreezing, at `null` — comes to. */
function asked(source: string, at: string | null, sheet = 'Sales') {
  const { grid, read } = files(source);
  const cell = at === null ? null : parseA1Addr(at);

  return setFreeze({ grid }, { sheet: sheet as SheetName, at: cell as A1Addr | null }, read);
}

/** The same, taken all the way through the checker, which is what lands in the file. */
function written(source: string, at: string | null): string {
  const intent = asked(source, at);
  if (intent.kind !== 'edit')
    throw new Error(`refused: ${intent.kind === 'refused' ? intent.why : ''}`);

  const { includes } = files(source);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);
  if (done.ok === false) {
    throw new Error(`the checker refused it: ${done.diagnostics[0]?.message ?? 'a surprise'}`);
  }

  return done.text;
}

describe('a sheet that freezes nothing yet', () => {
  it('gains the key, which is the one place a freeze is written', () => {
    expect(written(`${SALES}${CELLS}`, 'B2')).toBe(`${SALES}${CELLS}    freeze: B2\n`);
  });

  it('moves no cell, so the patch claims none', () => {
    const intent = asked(`${SALES}${CELLS}`, 'B2');
    expect(intent.kind === 'edit' && [...intent.expects.cells]).toEqual([]);
  });

  it('has nothing to take off', () => {
    const intent = asked(`${SALES}${CELLS}`, null);
    expect(intent.kind === 'refused' && intent.why).toContain('freezes nothing to take off');
  });
});

describe('a sheet already frozen', () => {
  const FROZEN = `${SALES}${CELLS}    freeze: B2\n`;

  it('is frozen somewhere else by writing over what is there', () => {
    expect(written(FROZEN, 'C4')).toBe(`${SALES}${CELLS}    freeze: C4\n`);
  });

  it('is unfrozen by taking the key out, not by writing A1', () => {
    expect(written(FROZEN, null)).toBe(`${SALES}${CELLS}`);
  });
});

describe('a freeze that cannot be written', () => {
  it('is refused at A1, which would freeze nothing (`docs/spec.md` §2)', () => {
    const intent = asked(`${SALES}${CELLS}`, 'A1');
    expect(intent.kind === 'refused' && intent.why).toContain('freezes nothing');
  });

  it('is refused on a sheet that is split, since the two cannot be combined', () => {
    const split = `${SALES}${CELLS}    split: { x: 120, y: 60 }\n`;
    const intent = asked(split, 'B2');
    expect(intent.kind === 'refused' && intent.why).toContain('cannot have both');
  });

  it('is refused where no sheet is named that', () => {
    const intent = asked(`${SALES}${CELLS}`, 'B2', 'Nowhere');
    expect(intent.kind === 'refused' && intent.why).toContain('there is no sheet named');
  });
});
