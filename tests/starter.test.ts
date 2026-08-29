import { mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cellAt, compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import type { A1Addr } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { STARTER, specPath } from 'yxl-vscode/starter';
import { build, check } from './oracle';

/** The spec a new one starts from, written where the compiler can be asked about it. */
function written(): string {
  const at = join(mkdtempSync(join(tmpdir(), 'yxl-new-')), 'sheet.yxl.yaml');
  writeFileSync(at, STARTER);
  return at;
}

describe('the spec a new one starts from', () => {
  it('is a spec the compiler builds, which is the only claim worth making about it', () => {
    const at = written();
    expect(check(at).said).toContain('ok');

    // And all the way to a workbook: `--check` reads the spec, this writes it.
    const workbook = at.replace(/\.yxl\.yaml$/, '.xlsx');
    build(at, workbook);
    expect(statSync(workbook).size).toBeGreaterThan(0);
  });

  it('reads here as one sheet with a total under two numbers', () => {
    const { doc, diagnostics } = load(parse(STARTER, { file: 'sheet.yxl.yaml' }));
    expect(diagnostics).toEqual([]);
    if (doc === null) throw new Error('did not load');

    const grid = compile(doc);
    expect(grid.diagnostics).toEqual([]);

    const sheet = grid.sheets[0];
    if (sheet === undefined) throw new Error('compiled no sheet');
    expect(cellAt(sheet, 'A1' as A1Addr)?.value).toBe('Item');
    expect(cellAt(sheet, 'B4' as A1Addr)?.formula).toBe('SUM(B2:B3)');
  });

  it('is drawn with the look it declares, so a new spec shows what a look is for', () => {
    const { doc } = load(parse(STARTER, { file: 'sheet.yxl.yaml' }));
    if (doc === null) throw new Error('did not load');

    const sheet = compile(doc).sheets[0];
    if (sheet === undefined) throw new Error('compiled no sheet');
    expect(sheet.columns[0]?.size).toBe(18);
  });
});

describe('where a new spec is written', () => {
  it('keeps a name that is already one this editor reads', () => {
    expect(specPath('/w/budget.yxl.yaml')).toBe('/w/budget.yxl.yaml');
    expect(specPath('/w/budget.yxl.yml')).toBe('/w/budget.yxl.yml');
  });

  it('makes one of a name that is not, rather than writing a file nothing here opens', () => {
    // A save dialog appends the filter's own extension, so a reader who types
    // `budget` gets `budget.yaml` — which every `when` clause here passes over.
    expect(specPath('/w/budget.yaml')).toBe('/w/budget.yxl.yaml');
    expect(specPath('/w/budget')).toBe('/w/budget.yxl.yaml');
  });
});
