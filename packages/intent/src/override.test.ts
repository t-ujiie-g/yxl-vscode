import type { A1Addr, SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import type { Intent } from './direct';
import { english, files, ROOT } from './harness';
import { overridable, override, type Says } from './override';

function written(sources: Record<string, string>, intent: Intent): string {
  if (intent.kind === 'refused') throw new Error(`refused: ${english(intent.why)}`);
  if (intent.kind !== 'edit') throw new Error('a file was written, not a spec');

  const { includes } = files(sources);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(sources[intent.file] ?? '', intent.patch, intent.expects, ctx);
  if (done.ok === false) throw new Error(`the checker refused it: ${done.diagnostics[0]?.message}`);

  return done.text;
}

function at(address: string) {
  return { sheet: 'Sales' as SheetName, at: address as A1Addr };
}

function overriding(sources: Record<string, string>, address: string, says: Says) {
  const { doc, grid, read } = files(sources);
  return override({ doc, grid }, at(address), says, read);
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

    expect(intent.kind === 'refused' && english(intent.why)).toContain('already overridden');
  });

  it('refuses the top-left of a filled range, where the one formula is stored', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      A2: 2\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;
    const intent = overriding({ [ROOT]: spec }, 'B1', { value: 99 });

    expect(intent.kind === 'refused' && english(intent.why)).toContain('split the range instead');
  });

  it('refuses an address nothing writes, which has nothing to make an exception to', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      A1: APAC\n` };
    const intent = overriding(sources, 'Z9', { value: 1 });

    expect(intent.kind === 'refused' && english(intent.why)).toContain(
      'nothing here to make an exception',
    );
  });

  it('refuses a sheet that is not there', () => {
    const sources = { [ROOT]: `${SALES}    cells:\n      A1: APAC\n` };
    const { doc, grid, read } = files(sources);
    const intent = override(
      { doc, grid },
      { sheet: 'Nowhere' as SheetName, at: 'A1' as A1Addr },
      { value: 1 },
      read,
    );

    expect(intent.kind === 'refused' && english(intent.why)).toContain('no sheet named');
  });
});

describe('where an override can be offered at all', () => {
  const spec = `${SALES}    cells:\n      A1: 1\n      A2: 2\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;

  it('says yes to a cell inside a range, away from its top-left', () => {
    const { grid } = files({ [ROOT]: spec });
    expect(overridable(grid, at('B2'))).toBe(true);
  });

  it('says no at the top-left, and no where nothing is written', () => {
    const { grid } = files({ [ROOT]: spec });
    expect([overridable(grid, at('B1')), overridable(grid, at('Z9'))]).toEqual([false, false]);
  });
});
