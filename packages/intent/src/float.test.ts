import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type A1Addr, type FilePath, filePath, type Rect, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { reading } from './direct';
import { chartOver, chartsOver, type Intent, imageAt } from './index';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);

function files(source: string) {
  const includes: IncludeReader = (_from, path) => (path === ROOT ? { file: ROOT, source } : null);
  const { doc } = load(parse(source, { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return { doc, grid: compile(doc, { read: includes }), read: reading(() => source), includes };
}

/** The intent through the checker — the file it leaves behind, or why not. */
function through(source: string, intent: Intent): string {
  if (intent.kind === 'refused') return `refused: ${intent.why}`;
  if (intent.kind !== 'edit') throw new Error('a file was not written');

  const { includes } = files(source);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);

  return done.ok === false ? `refused: ${done.diagnostics[0]?.message ?? 'a surprise'}` : done.text;
}

function charted(source: string, rect: Rect, type = 'column'): string {
  const { doc, grid, read } = files(source);
  return through(source, chartOver({ doc, grid }, { sheet: 'S' as SheetName, rect, type }, read));
}

function shapes(source: string, rect: Rect): string[] {
  const { doc, grid, read } = files(source);
  return chartsOver({ doc, grid }, { sheet: 'S' as SheetName, rect }, read).map((one) => one.id);
}

function pictured(source: string, path: string, at = 'E1'): string {
  const { doc, grid, read } = files(source);
  const where = { sheet: 'S' as SheetName, at: at as A1Addr, path };
  return through(source, imageAt({ doc, grid }, where, read));
}

const HEADED =
  'sheets:\n  - name: S\n    cells:\n      A1: Region\n      B1: Revenue\n      C1: Cost\n      A2: APAC\n      B2: 24\n      C2: 18\n      A3: EMEA\n      B3: 17\n      C3: 15\n';

const BARE =
  'sheets:\n  - name: S\n    cells:\n      A1: APAC\n      B1: 24\n      A2: EMEA\n      B2: 17\n';

describe('a chart over a rectangle', () => {
  it('is written under the sheet, a series per column past the labels', () => {
    const drawn = charted(HEADED, { top: 1, left: 1, bottom: 3, right: 3 });
    expect(drawn).toBe(
      `${HEADED}    charts:\n      - at: E1\n        type: column\n        series:\n          - values: B2:B3\n            categories: A2:A3\n            name_from: B1\n          - values: C2:C3\n            categories: A2:A3\n            name_from: C1\n`,
    );
  });

  it('plots the top row where it is not a heading, and names no series', () => {
    const drawn = charted(BARE, { top: 1, left: 1, bottom: 2, right: 2 });
    expect(drawn).toContain('- values: B1:B2\n            categories: A1:A2\n');
    expect(drawn).not.toContain('name_from');
  });

  it('floats past the cells it plots rather than over them', () => {
    expect(charted(HEADED, { top: 2, left: 2, bottom: 3, right: 3 })).toContain('at: E2');
  });

  it('goes in after the charts the sheet already has', () => {
    const already = `${HEADED}    charts:\n      - at: Z1\n        type: pie\n        series:\n          - values: B2:B3\n`;
    const drawn = charted(already, { top: 1, left: 1, bottom: 3, right: 2 });
    expect(drawn.indexOf('at: Z1')).toBeLessThan(drawn.indexOf('at: D1'));
  });

  it('refuses one column, which has nothing to plot against its labels', () => {
    expect(charted(HEADED, { top: 1, left: 1, bottom: 3, right: 1 })).toContain('refused:');
  });

  it('offers every shape a chart takes, and none where the rectangle cannot hold one', () => {
    expect(shapes(HEADED, { top: 1, left: 1, bottom: 3, right: 3 })).toEqual([
      'chart:column',
      'chart:bar',
      'chart:line',
      'chart:area',
      'chart:pie',
      'chart:doughnut',
      'chart:scatter',
      'chart:radar',
    ]);
    expect(shapes(HEADED, { top: 1, left: 1, bottom: 3, right: 1 })).toEqual([]);
  });

  it('refuses a sheet the spec does not have', () => {
    const { doc, grid, read } = files(HEADED);
    const where = { sheet: 'Nowhere' as SheetName, rect: { top: 1, left: 1, bottom: 2, right: 2 } };
    expect(chartOver({ doc, grid }, { ...where, type: 'pie' }, read).kind).toBe('refused');
    expect(chartsOver({ doc, grid }, where, read)).toEqual([]);
  });
});

describe('an image at a cell', () => {
  it('is written under the sheet, with the path as the reader gave it', () => {
    expect(pictured(BARE, 'assets/logo.png')).toBe(
      `${BARE}    images:\n      - at: E1\n        file: assets/logo.png\n`,
    );
  });

  it('quotes a path YAML would read as something else', () => {
    expect(pictured(BARE, 'art: old.png')).toContain('file: "art: old.png"');
  });

  it('goes in after the images the sheet already has', () => {
    const already = `${BARE}    images:\n      - at: Z1\n        file: a.png\n`;
    const drawn = pictured(already, 'b.png');
    expect(drawn.indexOf('a.png')).toBeLessThan(drawn.indexOf('b.png'));
  });

  it('refuses a format Excel does not decode, and a file with no extension at all', () => {
    expect(pictured(BARE, 'notes.txt')).toContain('not a picture format');
    expect(pictured(BARE, 'logo')).toContain('no extension');
  });
});
