import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import {
  type A1Addr,
  type FilePath,
  filePath,
  type NodeId,
  nodeId,
  type Rect,
  type SheetName,
} from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { reading } from './direct';
import { chartOver, chartsOver, type Intent, imageAt, moveFloat, sizeFloat } from './index';

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

describe('a float written beside what this editor does not model', () => {
  const CARRIED = `${BARE}    pivots:\n      - at: E1\n        source: A1:B2\n    # the pivot above is not modeled yet\n`;

  it('goes in under it, and under what the spec wrote about it (ADR-011)', () => {
    expect(charted(CARRIED, { top: 1, left: 1, bottom: 2, right: 2 })).toBe(
      `${CARRIED}    charts:\n      - at: D1\n        type: column\n        series:\n          - values: B1:B2\n            categories: A1:A2\n`,
    );
    expect(pictured(CARRIED, 'logo.png')).toBe(
      `${CARRIED}    images:\n      - at: E1\n        file: logo.png\n`,
    );
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

/** The entry a float was written as, by where it sits in the file. */
function entry(key: string, index: number): NodeId {
  return nodeId(JSON.stringify([ROOT, 'sheets', 0, key, index]));
}

function moved(source: string, node: NodeId, at: string): string {
  const { read } = files(source);
  return through(source, moveFloat({ node, at: at as A1Addr }, read));
}

function resized(
  source: string,
  node: NodeId,
  size: { width: number; height: number },
  natural: { width: number; height: number } | null = null,
): string {
  const { read } = files(source);
  return through(source, sizeFloat({ node, ...size, natural }, read));
}

const CHART = `${BARE}    charts:\n      - at: E1\n        type: pie\n        series:\n          - values: B1:B2\n`;
const PICTURE = `${BARE}    images:\n      - at: E1\n        file: logo.png\n`;

describe('a float moved', () => {
  it('rewrites its own anchor and nothing else', () => {
    expect(moved(CHART, entry('charts', 0), 'H7')).toBe(CHART.replace('at: E1', 'at: H7'));
    expect(moved(PICTURE, entry('images', 0), 'B9')).toBe(PICTURE.replace('at: E1', 'at: B9'));
  });

  it('refuses one anchored where a parameter says, rather than writing over it', () => {
    const held = CHART.replace('at: E1', 'at: "${corner}"');
    const spec = `params:\n  corner: E1\n${held}`;
    expect(moved(spec, entry('charts', 0), 'H7')).toContain('write over the parameter');
  });

  it('refuses an entry the file has not got', () => {
    expect(moved(CHART, entry('charts', 4), 'H7')).toContain('refused:');
  });
});

describe('a float resized', () => {
  it("writes a chart's own extent, in whole pixels", () => {
    const drawn = resized(CHART, entry('charts', 0), { width: 520.4, height: 300 });
    expect(drawn).toContain('size: { width: 520, height: 300 }');
  });

  it('writes over the extent one already has, rather than beside it', () => {
    const sized = CHART.replace('type: pie', 'type: pie\n        size: { width: 10, height: 10 }');
    const drawn = resized(sized, entry('charts', 0), { width: 60, height: 40 });
    expect(drawn).toContain('size: { width: 60, height: 40 }');
    expect(drawn).not.toContain('width: 10');
  });

  it("writes a factor over an image, since its extent is its own file's", () => {
    const natural = { width: 120, height: 60 };
    expect(resized(PICTURE, entry('images', 0), { width: 60, height: 30 }, natural)).toContain(
      'scale: 0.5',
    );
    expect(resized(PICTURE, entry('images', 0), { width: 240, height: 30 }, natural)).toContain(
      'scale: { x: 2, y: 0.5 }',
    );
  });

  it("takes the factor off again where the drag comes back to the file's own size", () => {
    const half = `${BARE}    images:\n      - at: E1\n        file: logo.png\n        scale: 0.5\n`;
    const natural = { width: 120, height: 60 };
    expect(resized(half, entry('images', 0), { width: 120, height: 60 }, natural)).toBe(PICTURE);
  });

  it('refuses an image whose file could not be measured, and one already at its own size', () => {
    expect(resized(PICTURE, entry('images', 0), { width: 60, height: 30 })).toContain(
      'not known here',
    );
    const natural = { width: 120, height: 60 };
    expect(resized(PICTURE, entry('images', 0), { width: 120, height: 60 }, natural)).toContain(
      'already at its own size',
    );
  });
});
