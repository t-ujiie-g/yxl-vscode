import type { HeaderCell, SpecNode } from '@yxl-vscode/spec';
import { addrAt, type Rect } from '@yxl-vscode/units';
import { compileFacets, decides } from './cell';
import { type Ctx, text } from './ctx';
import { drawFooterRow } from './footer';
import type {
  CompiledBand,
  CompiledCell,
  CompiledFill,
  CompiledLayout,
  CompiledMerge,
  CompiledRule,
} from './grid';
import { type Column, edges, type Placed } from './placed';
import type { DataOrigin } from './provenance';
import { blankAt, origin, refs } from './refs';
import { layersOf, type StyleLayer } from './style';

/** What one layout draws: its cells, filled formulas, bands, merges and rules, and where it landed. */
export interface Drawn {
  readonly cells: readonly CompiledCell[];
  readonly fills: readonly CompiledFill[];
  readonly bands: readonly CompiledBand[];
  readonly merges: readonly CompiledMerge[];
  readonly rules: readonly CompiledRule[];
  readonly layout: CompiledLayout;
}

/** A placed layout as the hand-written keys it compiles to would draw it (`docs/spec.md` §25). */
export function draw(ctx: Ctx, placed: Placed): Drawn {
  const cells: CompiledCell[] = [];
  const merges: CompiledMerge[] = [];
  const { layout } = placed;
  const merge = (rect: Rect) => merges.push({ rect, node: layout.id });

  drawHeader(ctx, placed, cells, merge);
  drawBody(placed, cells);
  for (const line of placed.footer) drawFooterRow(ctx, placed, line, cells, merge);

  const { left, right } = edges(placed);
  const span = (top: number, bottom: number): Rect => ({ top, bottom, left, right });

  return {
    cells,
    fills: placed.columns.flatMap((column) => fillOf(ctx, placed, column)),
    bands: placed.columns.flatMap((column) => bandOf(ctx, column)),
    merges,
    rules: placed.columns.flatMap((column) => rulesOf(ctx, placed, column)),
    layout: {
      name: layout.name,
      rect: span(placed.top, placed.lastRow),
      header: placed.depth === 0 ? null : span(placed.top, placed.bodyFirst - 1),
      body: span(placed.bodyFirst, placed.bodyLast),
      footer: placed.lastRow > placed.bodyLast ? span(placed.bodyLast + 1, placed.lastRow) : null,
      columns: placed.columns.map((one) => ({
        col: one.col,
        node: one.spec.id,
        shared: one.scope !== null,
      })),
      node: layout.id,
    },
  };
}

/** Header levels over `depth` rows, merged across where neighbours agree and down where a column runs out. */
function drawHeader(
  ctx: Ctx,
  placed: Placed,
  cells: CompiledCell[],
  merge: (rect: Rect) => void,
): void {
  const { layout, columns, depth, top } = placed;
  const worn = layersOf(ctx, layout, 'cell', layout.headerStyle, null);
  const levels = columns.map((one) => one.header);
  const keyOf = (cell: HeaderCell | null | undefined) => (cell == null ? null : sameness(cell));
  const colAt = (index: number) => columns[index]?.col ?? 0;
  const at = (index: number, row: number) => addrAt({ col: colAt(index), row: top + row });
  const blank = (index: number, row: number, style: readonly StyleLayer[], node: SpecNode) => {
    if (style.length > 0) cells.push(blankAt(at(index, row), style, origin(node, layout)));
  };
  const stretches = (index: number, row: number) =>
    row === (levels[index]?.length ?? 0) - 1 && row < depth - 1;
  const sameParents = (one: number, other: number, row: number) =>
    (levels[other]?.length ?? 0) > row &&
    Array.from({ length: row }, (_, level) => level).every(
      (level) => keyOf(levels[one]?.[level]) === keyOf(levels[other]?.[level]),
    );

  for (let row = 0; row < depth; row += 1) {
    let index = 0;
    while (index < columns.length) {
      const column = levels[index] ?? [];
      if (row >= column.length) {
        index += 1;
        continue;
      }

      const cell = column[row] ?? null;
      if (cell === null) {
        const below = stretches(index, row) ? depth - 1 : row;
        for (let down = row; down <= below; down += 1) blank(index, down, worn, layout);
        index += 1;
        continue;
      }

      const written = compileFacets(ctx, cell, at(index, row), origin(cell, layout), 'cell');
      const style = [...worn, ...written.style];
      cells.push({ ...written, style });

      if (stretches(index, row)) {
        for (let down = row + 1; down < depth; down += 1) blank(index, down, style, cell);
        merge({ top: top + row, bottom: top + depth - 1, left: colAt(index), right: colAt(index) });
        index += 1;
        continue;
      }

      let last = index;
      while (
        last + 1 < columns.length &&
        sameParents(index, last + 1, row) &&
        keyOf(levels[last + 1]?.[row]) === keyOf(cell) &&
        !stretches(last + 1, row)
      ) {
        last += 1;
      }
      for (let covered = index + 1; covered <= last; covered += 1) blank(covered, row, style, cell);
      if (last > index) {
        merge({ top: top + row, bottom: top + row, left: colAt(index), right: colAt(last) });
      }
      index = last + 1;
    }
  }
}

/** What makes two header cells the same cell for merging: what they hold and wear, not where they were written. */
function sameness(cell: HeaderCell): string {
  const { value, formula, rich, type, format, clearsFormat, style } = cell;
  return JSON.stringify({ value, formula, rich, type, format, clearsFormat, style });
}

function drawBody(placed: Placed, cells: CompiledCell[]): void {
  for (const [index, row] of placed.data.entries()) {
    for (const [field, value] of row.entries()) {
      const column = placed.inputs[field];
      if (value === null || column === undefined) continue;

      const at = addrAt({ col: column.col, row: placed.bodyFirst + index });
      const from = origin(column.spec, placed.layout, readFrom(placed, index, field));
      cells.push({ ...blankAt(at, [], from), value });
    }
  }
}

/** The field a body cell was read from, counted as its source counts: a CSV under its header row. */
function readFrom(placed: Placed, row: number, field: number): DataOrigin {
  const node = placed.layout.id;
  const { file, picks } = placed.read;
  if (file === null) return { kind: 'inline', node, row, col: field };
  if (picks === null) return { kind: 'external', node, file, row, col: field };
  return { kind: 'external', node, file, row: row + 1, col: picks[field] ?? field };
}

function fillOf(ctx: Ctx, placed: Placed, column: Column): CompiledFill[] {
  if (column.spec.formula === null) return [];

  const written = text(ctx, column.spec.formula, column.spec);
  const formula = refs(ctx, column.spec, written, placed, column.scope, placed.bodyFirst);
  if (formula === null) return [];

  return [
    {
      rect: { top: placed.bodyFirst, bottom: placed.bodyLast, left: column.col, right: column.col },
      anchor: addrAt({ col: column.col, row: placed.bodyFirst }),
      formula,
      node: column.spec.id,
      layout: placed.layout.id,
    },
  ];
}

/** A column's band, where it sets anything; a band that sets nothing contributes nothing (`docs/spec.md` §4). */
function bandOf(ctx: Ctx, column: Column): CompiledBand[] {
  const spec = column.spec;
  const sets =
    spec.width !== null ||
    spec.style !== null ||
    spec.format !== null ||
    spec.clearsFormat ||
    spec.hidden !== null ||
    spec.group !== null;
  if (!sets) return [];

  return [
    {
      first: column.col,
      last: column.col,
      size: spec.width,
      hidden: spec.hidden,
      group: spec.group,
      style: layersOf(ctx, spec, 'column', spec.style, spec.format, spec.clearsFormat),
      node: spec.id,
    },
  ];
}

function rulesOf(ctx: Ctx, placed: Placed, column: Column): CompiledRule[] {
  const body = {
    top: placed.bodyFirst,
    bottom: placed.bodyLast,
    left: column.col,
    right: column.col,
  };

  return column.spec.conditional.flatMap((rule): CompiledRule[] => {
    let written = rule;
    if (rule.test.kind === 'formula') {
      const body = refs(ctx, rule, rule.test.body, placed, column.scope, placed.bodyFirst);
      if (body === null) return [];
      written = { ...rule, test: { kind: 'formula', body } };
    }

    const test = decides(ctx, written);
    if (test === null) return [];

    return [
      {
        rect: body,
        test,
        style: layersOf(ctx, rule, 'conditional', rule.style, rule.format),
        stopIfTrue: rule.stopIfTrue,
        node: rule.id,
      },
    ];
  });
}
