import { type CompiledSheet, cellAt } from '@yxl-vscode/compile';
import { KEY } from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  addressesOf,
  type Rect,
  rangeOf,
  type SheetName,
} from '@yxl-vscode/units';
import { nothingChanges } from '@yxl-vscode/verify';
import { putEntry, sequenceIn } from './anchored';
import { type Intent, type Projection, type Reading, refused, writtenSheet } from './direct';
import type { Candidate } from './resolve';

/** A chart a gesture asked for over a rectangle, in the shape the reader picked. */
export interface Charting {
  readonly sheet: SheetName;
  readonly rect: Rect;
  readonly type: string;
}

/** The shapes offered for a new chart; the stacked variants are the same entry with the word changed. */
export const CHART_SHAPES = [
  'column',
  'bar',
  'line',
  'area',
  'pie',
  'doughnut',
  'scatter',
  'radar',
] as const;

/**
 * One candidate per shape a chart over this rectangle could take. A chart is a
 * shape as well as a range and the shape is not in the selection, so it is
 * asked rather than picked (ADR-001).
 */
export function chartsOver(
  spec: Projection,
  where: { readonly sheet: SheetName; readonly rect: Rect },
  read: Reading,
): readonly Candidate[] {
  const found = writtenSheet(spec, where.sheet, read);
  if (found.kind === 'refused') return [];
  if (plotted(found.sheet, where.rect) === null) return [];

  return CHART_SHAPES.map((type) => ({
    id: `chart:${type}`,
    what: `A ${type} chart`,
    moves: [],
    alone: false,
    intent: chartOver(spec, { ...where, type }, read),
  }));
}

/**
 * One `charts:` entry over a rectangle: its left column labels the points and
 * every other column is a series (`docs/spec.md` §12). The chart floats one
 * column past the rectangle, since a chart over the cells it plots hides them.
 */
export function chartOver(spec: Projection, where: Charting, read: Reading): Intent {
  const found = writtenSheet(spec, where.sheet, read);
  if (found.kind === 'refused') return found;

  const plot = plotted(found.sheet, where.rect);
  if (plot === null) {
    const wide = rangeOf(where.rect);
    return refused(
      `\`${wide}\` is one column, and a chart plots a column against the labels beside it`,
    );
  }

  const at = addrAt({ col: where.rect.right + GAP, row: where.rect.top });
  const body = [
    `${KEY.at}: ${at}`,
    `${KEY.type}: ${where.type}`,
    `${KEY.series}:`,
    ...plot.series.flatMap((one) => [
      `  - ${KEY.values}: ${one.values}`,
      `    ${KEY.categories}: ${plot.categories}`,
      ...(one.nameFrom === null ? [] : [`    ${KEY.nameFrom}: ${one.nameFrom}`]),
    ]),
  ].join('\n');

  const ops = [putEntry(sequenceIn(found, KEY.charts), body)];
  return { kind: 'edit', file: found.file, patch: { ops }, expects: nothingChanges };
}

/** The empty column left between the cells a chart plots and the chart itself. */
const GAP = 2;

/** What a rectangle plots: the labels down its left column, and a series per column beside it. */
interface Plotted {
  readonly categories: string;
  readonly series: readonly { readonly values: string; readonly nameFrom: A1Addr | null }[];
}

/** A rectangle read as Excel reads one; `null` where it is the one column, which plots nothing. */
function plotted(sheet: CompiledSheet, rect: Rect): Plotted | null {
  if (rect.right === rect.left) return null;

  const heads = naming(sheet, rect);
  const top = heads ? rect.top + 1 : rect.top;
  const down = { top, bottom: rect.bottom };
  const series = [];

  for (let col = rect.left + 1; col <= rect.right; col += 1) {
    series.push({
      values: rangeOf({ ...down, left: col, right: col }),
      nameFrom: heads ? addrAt({ col, row: rect.top }) : null,
    });
  }

  return { categories: rangeOf({ ...down, left: rect.left, right: rect.left }), series };
}

/** Whether the top row names the series: text across it, with something that is not text under it. */
function naming(sheet: CompiledSheet, rect: Rect): boolean {
  if (rect.bottom === rect.top) return false;

  const row = (at: number): (string | number | boolean | null)[] =>
    addressesOf({ ...rect, top: at, bottom: at, left: rect.left + 1 }).map(
      (addr) => cellAt(sheet, addr)?.value ?? null,
    );

  return (
    row(rect.top).every((value) => typeof value === 'string' && value !== '') &&
    row(rect.top + 1).some((value) => typeof value !== 'string')
  );
}

/** An image a gesture asked for: the cell it floats from, and the file beside the spec. */
export interface Picturing {
  readonly sheet: SheetName;
  readonly at: A1Addr;
  readonly path: string;
}

/** One `images:` entry at a cell; the path resolves against the spec, as a `data:` path does (`docs/spec.md` §13). */
export function imageAt(spec: Projection, where: Picturing, read: Reading): Intent {
  const found = writtenSheet(spec, where.sheet, read);
  if (found.kind === 'refused') return found;

  const why = unusable(where.path);
  if (why !== null) return refused(why);

  const body = `${KEY.at}: ${where.at}\n${KEY.file}: ${quoted(where.path)}`;
  const ops = [putEntry(sequenceIn(found, KEY.images), body)];
  return { kind: 'edit', file: found.file, patch: { ops }, expects: nothingChanges };
}

/** The extensions Excel decodes a picture by, since it never inspects the bytes (`docs/spec.md` §13). */
const PICTURES = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'tif',
  'tiff',
  'ico',
  'svg',
  'emf',
  'emz',
  'wmf',
  'wmz',
]);

function unusable(path: string): string | null {
  const extension = /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase() ?? null;
  if (extension === null) return `\`${path}\` has no extension, and Excel decodes a picture by one`;

  if (!PICTURES.has(extension)) {
    return `\`.${extension}\` is not a picture format Excel reads (${[...PICTURES].join(', ')})`;
  }
  return null;
}

/** A path is text, and a spec is read by people: quote only where YAML would read it as something else. */
function quoted(path: string): string {
  return /^[\w./-][\w ./-]*$/.test(path) ? path : JSON.stringify(path);
}
