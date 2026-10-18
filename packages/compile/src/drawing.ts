import {
  BORDER_EDGES,
  type HeaderCell,
  type ScalarValue,
  type SpecNode,
  type StyleSays,
} from '@yxl-vscode/spec';
import { addrAt, type CellRef, cellOf, type Rect } from '@yxl-vscode/units';
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
import { headerStyles } from './layout';
import { type Column, edges, type Placed } from './placed';
import type { DataOrigin, FacetOrigin } from './provenance';
import { blankAt, origin, refs } from './refs';
import {
  DATE_FORMAT,
  DATETIME_FORMAT,
  DURATION_FORMAT,
  dateSerial,
  durationSerial,
} from './serial';
import { layersOf, resolve, type StyleLayer } from './style';

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
  const merging = layout.headerMerge !== false;
  const merge = (rect: Rect) => merges.push({ rect, node: layout.id });

  drawTitle(ctx, placed, cells, merging ? merge : null);
  drawHeader(ctx, placed, cells, merging ? merge : null);
  const body = placed.columns.map((column) => bodyLook(ctx, placed, column));
  drawBody(ctx, placed, cells, body);
  mergeEqual(placed, merge);
  for (const line of placed.footer) drawFooterRow(ctx, placed, line, cells, merge);
  ctx.merged.set(
    layout.id,
    merges.map((one) => one.rect),
  );

  const { left, right } = edges(placed);
  const span = (top: number, bottom: number): Rect => ({ top, bottom, left, right });

  return {
    cells,
    fills: placed.columns.flatMap((column, index) =>
      fillOf(ctx, placed, column, body[index] ?? []),
    ),
    bands: placed.columns.flatMap((column) => bandOf(ctx, column)),
    merges,
    rules: placed.columns.flatMap((column) => rulesOf(ctx, placed, column)),
    layout: {
      name: layout.name,
      rect: span(placed.top, placed.lastRow),
      title: placed.headerFirst > placed.top ? span(placed.top, placed.headerFirst - 1) : null,
      header: placed.depth === 0 ? null : span(placed.headerFirst, placed.bodyFirst - 1),
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

/** Which edges of a cell face into the block it spans, and lose their border where nothing merges it (#122). */
interface Inner {
  readonly left: boolean;
  readonly right: boolean;
  readonly top: boolean;
  readonly bottom: boolean;
}

/** `style` with every border edge `inner` flags taken away, where the style draws one at all. */
function withoutInner(
  style: readonly StyleLayer[],
  inner: Inner,
  node: SpecNode,
): readonly StyleLayer[] {
  const said = resolve(style);
  const gives: { -readonly [K in keyof StyleSays]: StyleSays[K] } = {};
  for (const edge of BORDER_EDGES) {
    const drawn = said[`border.${edge}.style`];
    if (!inner[edge] || drawn === undefined || drawn === null) continue;
    gives[`border.${edge}.style`] = null;
    gives[`border.${edge}.color`] = null;
  }
  if (Object.keys(gives).length === 0) return style;
  return [...style, { through: 'cell', key: 'style', node: node.id, name: null, gives }];
}

/** A title, header or footer cell over the block from its own cell to `last`: merged, or each its own cell. */
function spanOf(
  cells: CompiledCell[],
  written: CompiledCell,
  last: CellRef,
  merge: ((rect: Rect) => void) | null,
  from: FacetOrigin,
  node: SpecNode,
): void {
  const first = cellOf(written.at);
  const styleAt = (at: CellRef) =>
    merge === null
      ? withoutInner(
          written.style,
          {
            left: at.col > first.col,
            right: at.col < last.col,
            top: at.row > first.row,
            bottom: at.row < last.row,
          },
          node,
        )
      : written.style;

  cells.push({ ...written, style: styleAt(first) });
  for (let row = first.row; row <= last.row; row += 1) {
    for (let col = first.col; col <= last.col; col += 1) {
      if (row === first.row && col === first.col) continue;
      const style = styleAt({ col, row });
      if (style.length > 0) cells.push(blankAt(addrAt({ col, row }), style, from));
    }
  }
  if (merge !== null && (last.col > first.col || last.row > first.row)) {
    merge({ top: first.row, bottom: last.row, left: first.col, right: last.col });
  }
}

/** A `title:` across the layout's width in its first row (`docs/spec.md` §25). */
function drawTitle(
  ctx: Ctx,
  placed: Placed,
  cells: CompiledCell[],
  merge: ((rect: Rect) => void) | null,
): void {
  const { layout } = placed;
  if (layout.title === null) return;

  const { left, right } = edges(placed);
  const at = addrAt({ col: left, row: placed.top });
  const from = origin(layout.title, layout);
  const written = compileFacets(ctx, layout.title, at, from, 'cell');
  spanOf(cells, written, { col: right, row: placed.top }, merge, from, layout.title);
}

/** Header levels over `depth` rows, merged across where neighbours agree and down where a column runs out. */
function drawHeader(
  ctx: Ctx,
  placed: Placed,
  cells: CompiledCell[],
  merge: ((rect: Rect) => void) | null,
): void {
  const { layout, columns, depth, headerFirst: top } = placed;
  const styles = headerStyles(layout).map((use) => layersOf(ctx, layout, 'cell', use, null));
  const wornAt = (row: number) => styles[Math.min(row, styles.length - 1)] ?? [];
  const levels = columns.map((one) => one.header);
  const keyOf = (cell: HeaderCell | null | undefined) => (cell == null ? null : sameness(cell));
  const colAt = (index: number) => columns[index]?.col ?? 0;
  const at = (index: number, row: number) => addrAt({ col: colAt(index), row: top + row });
  const blank = (index: number, row: number, style: readonly StyleLayer[]) => {
    if (style.length > 0) cells.push(blankAt(at(index, row), style, origin(layout, layout)));
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
        for (let down = row; down <= below; down += 1) blank(index, down, wornAt(row));
        index += 1;
        continue;
      }

      const from = origin(cell, layout);
      const written = compileFacets(ctx, cell, at(index, row), from, 'cell');
      const worn = { ...written, style: [...wornAt(row), ...written.style] };

      if (stretches(index, row)) {
        spanOf(cells, worn, { col: colAt(index), row: top + depth - 1 }, merge, from, cell);
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
      spanOf(cells, worn, { col: colAt(last), row: top + row }, merge, from, cell);
      index = last + 1;
    }
  }
}

/** What makes two header cells the same cell for merging: what they hold and wear, not where they were written. */
function sameness(cell: HeaderCell): string {
  const { value, formula, rich, type, format, clearsFormat, style } = cell;
  return JSON.stringify({ value, formula, rich, type, format, clearsFormat, style });
}

/** How many style-only body cells a layout draws past its data; `rows: 1048576` must not become a million cells (ADR-019). */
const STYLED_BLANKS = 50_000;

/** What one column's body cells wear: the layout's `body_style`, then the column's own over it. */
function bodyLook(ctx: Ctx, placed: Placed, column: Column): readonly StyleLayer[] {
  const { layout } = placed;
  return [
    ...(layout.bodyStyle === null ? [] : layersOf(ctx, layout, 'cell', layout.bodyStyle, null)),
    ...(column.spec.bodyStyle === null
      ? []
      : layersOf(ctx, column.spec, 'cell', column.spec.bodyStyle, null)),
  ];
}

/** Every input column's body: each field the data holds, and a blank in the body's look where it holds none. */
function drawBody(
  ctx: Ctx,
  placed: Placed,
  cells: CompiledCell[],
  looks: readonly (readonly StyleLayer[])[],
): void {
  const rows = placed.bodyLast - placed.bodyFirst + 1;
  const styled = Math.max(placed.data.length, Math.floor(STYLED_BLANKS / placed.inputs.length));
  for (const [field, column] of placed.inputs.entries()) {
    const style = looks[placed.columns.indexOf(column)] ?? [];
    const { spec } = column;
    const band = layersOf(ctx, spec, 'column', spec.style, spec.format, spec.clearsFormat);
    const formatted = [band, style].some((one) => resolve(one).format != null);

    for (let index = 0; index < rows; index += 1) {
      const at = addrAt({ col: column.col, row: placed.bodyFirst + index });
      const value = placed.data[index]?.[field] ?? null;
      const from = origin(column.spec, placed.layout, readFrom(placed, index, field));
      if (value === null) {
        if (style.length > 0 && index < styled) cells.push(blankAt(at, style, from));
        continue;
      }
      cells.push({ ...blankAt(at, style, from), ...typedValue(ctx, column, value, formatted) });
    }
  }
}

/** A field as the cell holds it: a typed date or duration as its serial, under the format it reads unless the column sets one. */
function typedValue(
  ctx: Ctx,
  column: Column,
  value: ScalarValue,
  formatted: boolean,
): Pick<CompiledCell, 'value' | 'type' | 'format'> {
  const type = column.spec.type;
  if (typeof value === 'string' && type === 'date') {
    const read = dateSerial(value, ctx.from1904);
    if (read !== null) {
      const format = read.withTime ? DATETIME_FORMAT : DATE_FORMAT;
      return { value: read.serial, type, format: formatted ? null : format };
    }
  }
  if (typeof value === 'string' && type === 'duration') {
    const read = durationSerial(value);
    if (read !== null) return { value: read, type, format: formatted ? null : DURATION_FORMAT };
  }
  return { value, type: null, format: null };
}

/** Each `merge_equal` column's runs of one value down the body, cut where one left of it changes (`docs/spec.md` §25). */
function mergeEqual(placed: Placed, merge: (rect: Rect) => void): void {
  const { data, inputs } = placed;
  const at = (row: number, field: number) => data[row]?.[field] ?? null;
  const outer: number[] = [];

  for (const [field, column] of inputs.entries()) {
    if (!column.spec.mergeEqual) continue;

    let start = 0;
    for (let row = 1; row <= data.length; row += 1) {
      const continues =
        row < data.length &&
        at(row, field) !== null &&
        at(row, field) === at(start, field) &&
        outer.every((left) => at(row, left) === at(row - 1, left));
      if (continues) continue;

      if (row - start > 1 && at(start, field) !== null) {
        const top = placed.bodyFirst + start;
        merge({ top, bottom: placed.bodyFirst + row - 1, left: column.col, right: column.col });
      }
      start = row;
    }
    outer.push(field);
  }
}

/** The field a body cell was read from, counted as its source counts: a CSV under its header row. */
function readFrom(placed: Placed, row: number, field: number): DataOrigin {
  const node = placed.layout.id;
  const { file, picks } = placed.taken;
  if (file === null) return { kind: 'inline', node, row, col: field };
  if (picks === null) return { kind: 'external', node, file, row, col: field };
  return { kind: 'external', node, file, row: row + 1, col: picks[field] ?? field };
}

function fillOf(
  ctx: Ctx,
  placed: Placed,
  column: Column,
  style: readonly StyleLayer[],
): CompiledFill[] {
  if (column.spec.formula === null) return [];

  const written = text(ctx, column.spec.formula, column.spec);
  const formula = refs(ctx, column.spec, written, placed, column.scope, placed.bodyFirst);
  if (formula === null) return [];

  return [
    {
      rect: { top: placed.bodyFirst, bottom: placed.bodyLast, left: column.col, right: column.col },
      anchor: addrAt({ col: column.col, row: placed.bodyFirst }),
      formula,
      style,
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
