import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type A1Addr, type FilePath, filePath, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import type { Intent, Text } from './direct';
import { override, type Says } from './override';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);

function files(sources: Record<string, string>) {
  const text: Text = (file) => sources[file] ?? null;
  const read: IncludeReader = (_from, path) => {
    const file = filePath(path);
    return file === null || sources[path] === undefined ? null : { file, source: sources[path] };
  };

  const { doc } = load(parse(sources[ROOT] ?? '', { file: ROOT }), read);
  if (doc === null) throw new Error('did not load');

  return { doc, grid: compile(doc, { read }), text, read };
}

function written(sources: Record<string, string>, intent: Intent): string {
  if (intent.kind !== 'edit') throw new Error(`refused: ${intent.why}`);

  const { read } = files(sources);
  const ctx: Ctx = { root: ROOT, file: intent.file, read };
  const done = checked(sources[intent.file] ?? '', intent.patch, intent.expects, ctx);
  if (done.ok === false) throw new Error(`the checker refused it: ${done.diagnostics[0]?.message}`);

  return done.text;
}

function at(address: string) {
  return { sheet: 'Sales' as SheetName, at: address as A1Addr };
}

function overriding(sources: Record<string, string>, address: string, says: Says) {
  const { doc, grid, text } = files(sources);
  return override(doc, grid, at(address), says, text);
}

const SALES = 'sheets:\n  - name: Sales\n';

describe('a cell written as an override', () => {
  it('is added to a spec that has no overrides yet, with the key it needs', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      A1: APAC\n` };
    const after = written(sources, overriding(sources, 'A1', { value: 'EMEA' }));

    expect(after).toBe(
      `${SALES}    cells:\n      A1: APAC\noverrides:\n  - at: Sales!A1\n    value: EMEA\n`,
    );
  });

  it('joins the ones already there rather than starting again', () => {
    const spec = `${SALES}    cells:\n      A1: APAC\n      B1: 1\noverrides:\n  - at: Sales!A1\n    value: EMEA\n`;
    const sources = { [ROOT]: spec };
    const after = written(sources, overriding(sources, 'B1', { value: 2 }));

    expect(after).toBe(`${spec}  - at: Sales!B1\n    value: 2\n`);
  });

  it('carries the reason, which is the whole point of saying it out loud', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      A1: APAC\n` };
    const after = written(
      sources,
      overriding(sources, 'A1', { value: 'EMEA', reason: 'audit asked for it' }),
    );

    expect(after).toContain('reason: "audit asked for it"');
  });

  it('writes a formula where a formula is what the cell should hold', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      A1: 1\n      B1: 2\n` };
    const after = written(sources, overriding(sources, 'B1', { formula: 'A1*2' }));

    expect(after).toContain('formula: "A1*2"');
  });

  it('reaches a cell no ordinary edit could, which is what it is for', () => {
    // Filled by a range: one formula writes five hundred cells, and this row
    // does not follow the rule (`docs/spec.md` §23).
    const spec = `${SALES}    cells:\n      A1: 1\n      A2: 2\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;
    const sources = { [ROOT]: spec };
    const after = written(sources, overriding(sources, 'B2', { value: 99 }));

    expect(after).toContain('at: Sales!B2');
    expect(after).toContain('value: 99');
  });

  it('takes effect: the cell the override names shows what it says', () => {
    const spec = `${SALES}    cells:\n      A1: APAC\n`;
    const sources = { [ROOT]: spec };
    const after = written(sources, overriding(sources, 'A1', { value: 'EMEA' }));

    const { grid } = files({ [ROOT]: after });
    expect(grid.sheets[0]?.cells.get('A1')?.value).toBe('EMEA');
  });
});

describe('what an override will not do', () => {
  it('refuses a second override for a cell that has one, and says where the first is', () => {
    const spec = `${SALES}    cells:\n      A1: APAC\noverrides:\n  - at: Sales!A1\n    value: EMEA\n`;
    const intent = overriding({ [ROOT]: spec }, 'A1', { value: 'APAC' });

    expect(intent.kind === 'refused' && intent.why).toContain('already overridden');
  });

  it('refuses a sheet that is not there', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      A1: APAC\n` };
    const { doc, grid, text } = files(sources);
    const intent = override(
      doc,
      grid,
      { sheet: 'Nowhere' as SheetName, at: 'A1' as A1Addr },
      { value: 1 },
      text,
    );

    expect(intent.kind === 'refused' && intent.why).toContain('no sheet named');
  });
});
