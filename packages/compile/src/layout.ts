import type { Saying } from '@yxl-vscode/diag';
import type {
  Anchor,
  ByMeaning,
  DataRow,
  FooterCell,
  FooterEntry,
  FooterRow,
  HeaderCell,
  Layout,
  LayoutColumn,
  Named,
  ScalarValue,
  Sheet,
  SpecNode,
  Templated,
} from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  cellOf,
  filePath,
  parseA1Range,
  parseQualifiedRange,
  type QualifiedAddr,
  type Rect,
  rectOf,
  type SheetName,
} from '@yxl-vscode/units';
import { address, compileFacets, decides } from './cell';
import { CODE } from './codes';
import { type Ctx, filled, reject, text } from './ctx';
import type {
  CompiledBand,
  CompiledCell,
  CompiledFill,
  CompiledLayout,
  CompiledMerge,
  CompiledRule,
} from './grid';
import type { FacetOrigin } from './provenance';
import { layersOf, type StyleLayer } from './style';
import { readHeadedCsv, readJson } from './table';
import { say } from './text';

/**
 * A layout placed ahead of every sheet, which is what lets a spec name it from
 * anywhere (`docs/spec.md` §25): its columns where they landed, the rows its
 * data holds over the input columns, and the rows its footer takes.
 */
export interface Placed {
  readonly layout: Layout;
  readonly sheet: SheetName;
  readonly columns: readonly Column[];
  readonly inputs: readonly Column[];
  readonly data: readonly DataRow[];
  readonly top: number;
  readonly depth: number;
  readonly bodyFirst: number;
  readonly bodyLast: number;
  readonly footer: readonly FooterLine[];
  readonly lastRow: number;
}

/** A layout column where it landed, a block's under its qualified name, with every header level above it. */
interface Column {
  readonly name: string;
  readonly col: number;
  readonly scope: string | null;
  readonly field: string;
  readonly header: readonly (HeaderCell | null)[];
  readonly spec: LayoutColumn;
}

/** One footer row as it lands: its row, and the values of the groups around it. */
interface FooterLine {
  readonly row: number;
  readonly entry: FooterRow;
  readonly keys: readonly (readonly [string, ScalarValue])[];
}

/** Excel's grid ends here. */
const LAST_ROW = 1_048_576;

/** Place every sheet's layouts in the order written, before any sheet is drawn (`docs/spec.md` §25). */
export function placeAll(ctx: Ctx, sheets: readonly (readonly [SheetName, Sheet])[]): void {
  const taken = new Set<string>();

  for (const [name, sheet] of sheets) {
    for (const layout of sheet.layouts) {
      const placed = place(ctx, layout, name);
      if (placed === null) continue;

      ctx.placed.set(layout.id, placed);
      if (layout.name === null) continue;

      const folded = layout.name.toLowerCase();
      if (taken.has(folded)) {
        reject(
          ctx,
          CODE.badLayout,
          say('compile.layout-named-twice', { name: layout.name }),
          layout,
        );
        continue;
      }
      taken.add(folded);
      ctx.layouts.set(layout.name, placed);
    }
  }
}

function place(ctx: Ctx, layout: Layout, sheet: SheetName): Placed | null {
  const at = anchored(ctx, layout.at, layout, sheet);
  if (at === null) return null;

  const corner = cellOf(at);
  const columns = expand(ctx, layout, corner.col);
  if (columns === null) return null;

  const inputs = columns.filter((one) => one.spec.formula === null);
  const data = rowsOf(ctx, layout, inputs);
  if (data === null) return null;

  const rows = bodyRows(ctx, layout, data);
  if (rows === null) return null;

  const depth = Math.max(0, ...columns.map((one) => one.header.length));
  if (layout.headerStyle !== null && depth === 0) {
    reject(ctx, CODE.badLayout, say('compile.header-style-with-no-header'), layout);
  }

  const bodyFirst = corner.row + depth;
  const bodyLast = Math.min(LAST_ROW, bodyFirst + rows - 1);
  const scope = { ctx, layout, columns, inputs, data };
  const footer: FooterLine[] = [];
  const next = lines(scope, layout.footer, [], [...data.keys()], bodyLast + 1, footer);

  return {
    layout,
    sheet,
    columns,
    inputs,
    data,
    top: corner.row,
    depth,
    bodyFirst,
    bodyLast,
    footer,
    lastRow: next === null ? bodyLast : next - 1,
  };
}

/** A layout's `columns:`, every block placed as the columns it stands for, left to right from `left`. */
function expand(ctx: Ctx, layout: Layout, left: number): Column[] | null {
  if (layout.columns.length === 0) {
    reject(ctx, CODE.badLayout, say('compile.layout-has-no-columns'), layout);
    return null;
  }

  const columns: Column[] = [];
  const instances = new Set<string>();

  for (const entry of layout.columns) {
    if (entry.kind === 'column') {
      const col = left + columns.length;
      columns.push({
        name: entry.name,
        col,
        scope: null,
        field: entry.field ?? entry.name,
        header: entry.header ?? [],
        spec: entry,
      });
      continue;
    }

    const block = ctx.blocks.get(entry.block);
    if (block === undefined) {
      reject(ctx, CODE.badLayout, say('compile.no-such-block', { name: entry.block }), entry);
      return null;
    }

    const as = entry.as ?? entry.block;
    if (instances.has(as)) {
      reject(ctx, CODE.badLayout, say('compile.column-named-twice', { name: as }), entry);
      return null;
    }
    instances.add(as);

    for (const [name] of entry.fields) {
      const fills = block.columns.find((one) => one.name === name && one.formula === null);
      if (fills === undefined) {
        reject(ctx, CODE.badLayout, say('compile.fields-names-no-input', { name }), entry);
        return null;
      }
    }

    for (const column of block.columns) {
      const qualified = `${as}.${column.name}`;
      const field = entry.fields.find(([name]) => name === column.name)?.[1];
      columns.push({
        name: qualified,
        col: left + columns.length,
        scope: as,
        field: field ?? column.field ?? qualified,
        header: [...(entry.header ?? []), ...(column.header ?? [])],
        spec: column,
      });
    }
  }

  const seen = new Set<string>();
  for (const column of columns) {
    const clash = seen.has(column.name) || (column.scope === null && instances.has(column.name));
    if (clash) {
      reject(ctx, CODE.badLayout, say('compile.column-named-twice', { name: column.name }), layout);
      return null;
    }
    seen.add(column.name);
  }
  return columns;
}

/** The rows the layout's source holds, over its input columns: by position, or by field name. */
function rowsOf(ctx: Ctx, layout: Layout, inputs: readonly Column[]): DataRow[] | null {
  const source = layout.source;
  if (source === null) {
    const named = inputs.find((one) => one.spec.field !== null);
    if (named === undefined) return [];

    reject(ctx, CODE.badLayout, say('compile.field-with-no-file', { column: named.name }), layout);
    return null;
  }

  if (source.kind === 'inline') {
    const rows = source.rows.map((row) => row.map((one) => filled(ctx, one, layout).value));
    return positional(ctx, layout, inputs, rows);
  }

  const opened = open(ctx, layout, source.path);
  if (opened === null) return null;

  const problem = (said: Saying) => {
    const message = say('compile.bad-table', { file: opened.file, problem: said });
    reject(ctx, CODE.badTable, message, layout);
    return null;
  };

  if (source.kind === 'csv') {
    const table = readHeadedCsv(opened.source);
    if ('problem' in table) return problem(table.problem);

    const picks: number[] = [];
    for (const column of inputs) {
      const index = table.names.indexOf(column.field);
      if (index < 0) {
        return problem(
          say('compile.csv-has-no-field', { field: column.field, column: column.name }),
        );
      }
      picks.push(index);
    }
    return table.rows.map((row) => picks.map((index) => row[index] ?? null));
  }

  if (objectRows(opened.source)) {
    const table = readJson(
      opened.source,
      inputs.map((one) => one.field),
    );
    return 'problem' in table ? problem(table.problem) : [...table.rows];
  }

  const table = readJson(opened.source, null);
  return 'problem' in table ? problem(table.problem) : positional(ctx, layout, inputs, table.rows);
}

function objectRows(source: string): boolean {
  try {
    const read: unknown = JSON.parse(source);
    return (
      Array.isArray(read) &&
      read.some((one) => one !== null && typeof one === 'object' && !Array.isArray(one))
    );
  } catch {
    return false;
  }
}

/** Rows matched to the input columns in order, as `values:` and a JSON array of arrays are. */
function positional(
  ctx: Ctx,
  layout: Layout,
  inputs: readonly Column[],
  rows: readonly DataRow[],
): DataRow[] | null {
  const named = inputs.find((one) => one.spec.field !== null);
  if (named !== undefined) {
    reject(ctx, CODE.badLayout, say('compile.field-by-position', { column: named.name }), layout);
    return null;
  }

  for (const [index, row] of rows.entries()) {
    if (row.length <= inputs.length) continue;

    const message = say('compile.row-too-long', {
      at: index + 1,
      fields: row.length,
      inputs: inputs.length,
    });
    reject(ctx, CODE.badLayout, message, layout);
    return null;
  }
  return [...rows];
}

function open(ctx: Ctx, layout: Layout, path: Templated<string>) {
  const spelled = text(ctx, path, layout);
  const read = filePath(spelled);
  if (read === null) {
    reject(ctx, CODE.badPath, say('compile.data-needs-a-path'), layout);
    return null;
  }
  if (ctx.read === null) {
    reject(ctx, CODE.noDataReader, say('compile.nothing-can-read', { path: read }), layout);
    return null;
  }

  const opened = ctx.read(ctx.from, read);
  if (opened === null)
    reject(ctx, CODE.unreadableData, say('compile.cannot-read', { path: read }), layout);
  return opened;
}

/** How many body rows: `rows:`, which may reserve more than the data fills, or as many as it holds. */
function bodyRows(ctx: Ctx, layout: Layout, data: readonly DataRow[]): number | null {
  if (layout.rows !== null) {
    if (!Number.isInteger(layout.rows) || layout.rows < 1) {
      reject(ctx, CODE.badLayout, say('compile.rows-must-be-whole'), layout);
      return null;
    }
    if (layout.rows < data.length) {
      const message = say('compile.rows-fewer-than-data', { rows: layout.rows, data: data.length });
      reject(ctx, CODE.badLayout, message, layout);
      return null;
    }
    return layout.rows;
  }

  if (layout.source === null || data.length === 0) {
    reject(ctx, CODE.badLayout, say('compile.layout-needs-rows'), layout);
    return null;
  }
  return data.length;
}

interface Scope {
  readonly ctx: Ctx;
  readonly layout: Layout;
  readonly columns: readonly Column[];
  readonly inputs: readonly Column[];
  readonly data: readonly DataRow[];
}

/** Footer entries from `row` down, a group once per value among `members`; the row after, or `null`. */
function lines(
  scope: Scope,
  entries: readonly FooterEntry[],
  keys: readonly (readonly [string, ScalarValue])[],
  members: readonly number[],
  row: number,
  into: FooterLine[],
): number | null {
  const { ctx } = scope;
  let next = row;

  for (const entry of entries) {
    if (entry.kind === 'row') {
      if (!rowFits(scope, entry)) return null;
      into.push({ row: next, entry, keys });
      next += 1;
      continue;
    }

    const field = scope.inputs.findIndex((one) => one.name === entry.by);
    if (field < 0) {
      reject(
        ctx,
        CODE.unknownColumn,
        say('compile.not-an-input-column', { name: entry.by }),
        entry,
      );
      return null;
    }
    if (keys.some(([name]) => name === entry.by)) {
      reject(ctx, CODE.badLayout, say('compile.group-inside-itself', { name: entry.by }), entry);
      return null;
    }
    if (scope.layout.source === null && entry.order.kind !== 'listed') {
      reject(ctx, CODE.badLayout, say('compile.group-needs-data', { name: entry.by }), entry);
      return null;
    }

    const fieldAt = (index: number): ScalarValue => scope.data[index]?.[field] ?? null;
    const values = groupValues(ctx, entry, members.map(fieldAt));
    if (values === null) return null;

    for (const value of values) {
      const inside = members.filter((index) => fieldAt(index) === value);
      const after = lines(scope, entry.rows, [...keys, [entry.by, value]], inside, next, into);
      if (after === null) return null;
      next = after;
    }
  }
  return next;
}

/** A group's values in `order`: as the data lists them, sorted, or as listed — which must hold them all. */
function groupValues(
  ctx: Ctx,
  group: Extract<FooterEntry, { kind: 'group' }>,
  held: readonly ScalarValue[],
): ScalarValue[] | null {
  const present = [...new Set(held)];
  const order = group.order;

  if (order.kind !== 'listed') {
    if (order.kind === 'asc') return present.sort(compareGroups);
    if (order.kind === 'desc') return present.sort((one, other) => compareGroups(other, one));
    return present;
  }

  const listed = new Set<ScalarValue>();
  for (const value of order.values) {
    if (listed.has(value)) {
      reject(ctx, CODE.badLayout, say('compile.order-lists-twice', { value: label(value) }), group);
      return null;
    }
    listed.add(value);
  }

  const missing = present.find((value) => !listed.has(value));
  if (missing !== undefined) {
    reject(ctx, CODE.badLayout, say('compile.order-leaves-out', { value: label(missing) }), group);
    return null;
  }
  return [...order.values];
}

/** Numbers, then text — shorter first, as yxl sorts it rather than as §25 says — then the rest, a blank last. */
function compareGroups(one: ScalarValue, other: ScalarValue): number {
  if (typeof one === 'number' && typeof other === 'number') return one - other;
  if (typeof one === 'string' && typeof other === 'string') {
    if (one.length !== other.length) return one.length - other.length;
    return one < other ? -1 : one > other ? 1 : 0;
  }
  return rank(one) - rank(other);
}

function rank(value: ScalarValue): number {
  if (typeof value === 'number') return 0;
  if (typeof value === 'string') return 1;
  return value === null ? 3 : 2;
}

/** A group value as a label spells it: a whole number without a decimal point, a blank as nothing. */
function label(value: ScalarValue): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' && Number.isInteger(value) && Math.abs(value) < 1e15) {
    return value.toFixed(0);
  }
  return String(value);
}

/** Whether every cell a footer row writes names a column, and every `merge_to` spans rightward over nothing written. */
function rowFits(scope: Scope, row: FooterRow): boolean {
  const { ctx } = scope;
  const colOf = (name: string) => scope.columns.find((one) => one.name === name)?.col;

  for (const cell of row.cells) {
    const first = colOf(cell.column);
    if (first === undefined) {
      reject(ctx, CODE.unknownColumn, say('compile.no-such-column', { name: cell.column }), cell);
      return false;
    }
    if (cell.mergeTo === null) continue;

    const last = colOf(cell.mergeTo);
    if (last === undefined) {
      reject(ctx, CODE.unknownColumn, say('compile.no-such-column', { name: cell.mergeTo }), cell);
      return false;
    }
    if (last <= first) {
      const message = say('compile.merges-leftward', { name: cell.column, to: cell.mergeTo });
      reject(ctx, CODE.badLayout, message, cell);
      return false;
    }

    const over = row.cells.find((one) => {
      const col = colOf(one.column) ?? 0;
      return col > first && col <= last;
    });
    if (over !== undefined) {
      const message = say('compile.merges-over', { name: cell.column, over: over.column });
      reject(ctx, CODE.badLayout, message, cell);
      return false;
    }
  }
  return true;
}

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

  const left = placed.columns[0]?.col ?? 0;
  const right = placed.columns[placed.columns.length - 1]?.col ?? left;
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
      cells.push({ ...blankAt(at, [], origin(column.spec, placed.layout)), value });
    }
  }
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

/** One footer row: each cell it names, and a blank in its style under every other column. */
function drawFooterRow(
  ctx: Ctx,
  placed: Placed,
  line: FooterLine,
  cells: CompiledCell[],
  merge: (rect: Rect) => void,
): void {
  const { entry, row } = line;
  const worn = layersOf(ctx, entry, 'cell', entry.style, null);
  let coveredTo = 0;
  let cover: readonly StyleLayer[] = [];

  for (const column of placed.columns) {
    const at = addrAt({ col: column.col, row });
    if (column.col <= coveredTo) {
      if (cover.length > 0) cells.push(blankAt(at, cover, origin(entry, placed.layout)));
      continue;
    }

    const cell = entry.cells.find((one) => one.column === column.name);
    if (cell === undefined) {
      if (worn.length > 0) cells.push(blankAt(at, worn, origin(entry, placed.layout)));
      continue;
    }

    const written = footerCell(ctx, placed, cell, line, at, worn);
    if (written === null) continue;
    cells.push(written);

    if (cell.mergeTo === null) continue;
    const last = placed.columns.find((one) => one.name === cell.mergeTo)?.col ?? column.col;
    merge({ top: row, bottom: row, left: column.col, right: last });
    coveredTo = last;
    cover = written.style;
  }
}

function footerCell(
  ctx: Ctx,
  placed: Placed,
  cell: FooterCell,
  line: FooterLine,
  at: A1Addr,
  worn: readonly StyleLayer[],
): CompiledCell | null {
  const from = origin(cell, placed.layout);

  if (cell.total !== null) {
    const col = placed.columns.find((one) => one.name === cell.column)?.col ?? 0;
    const formula = total(placed, cell.total, col, line.keys);
    return { ...blankAt(at, worn, from), formula };
  }

  let spelled: FooterCell = cell;
  if (cell.value?.kind === 'literal' && typeof cell.value.value === 'string') {
    const value = groupText(ctx, cell, cell.value.value, line.keys);
    if (value === null) return null;
    spelled = { ...spelled, value: { kind: 'literal', value } };
  }
  if (cell.formula?.kind === 'inline') {
    const body = refs(ctx, cell, cell.formula.body, placed, null, line.row);
    if (body === null) return null;
    spelled = { ...spelled, formula: { kind: 'inline', body } };
  }

  const written = compileFacets(ctx, spelled, at, from, 'cell');
  return { ...written, style: [...worn, ...written.style] };
}

/** `{ total: … }` as a formula over the column's body, filtered by every enclosing group (`docs/spec.md` §25). */
function total(
  placed: Placed,
  kind: NonNullable<FooterCell['total']>,
  col: number,
  keys: readonly (readonly [string, ScalarValue])[],
): string {
  const range = (at: number) =>
    `${addrAt({ col: at, row: placed.bodyFirst })}:${addrAt({ col: at, row: placed.bodyLast })}`;
  const body = range(col);
  const criteria = keys
    .map(([name, value]) => {
      const by = placed.columns.find((one) => one.name === name)?.col ?? col;
      return `,${range(by)},${criterion(value)}`;
    })
    .join('');

  if (keys.length === 0) {
    const plain = { sum: 'SUM', average: 'AVERAGE', min: 'MIN', max: 'MAX', count: 'COUNTA' };
    return `${plain[kind]}(${body})`;
  }
  if (kind === 'count') return `COUNTIFS(${body},"<>"${criteria})`;

  const grouped = { sum: 'SUMIFS', average: 'AVERAGEIFS', min: 'MINIFS', max: 'MAXIFS' };
  return `${grouped[kind]}(${body}${criteria})`;
}

/** A group value as an `…IFS` criterion that matches it and nothing else: text compared with `=`, its wildcards escaped. */
function criterion(value: ScalarValue): string {
  if (typeof value === 'string') {
    const escaped = value.replace(/[~*?]/g, (char) => `~${char}`).replace(/"/g, '""');
    return `"=${escaped}"`;
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return label(value);
  return '""';
}

/** A footer label with each `{{name}}` spelled as the value of the enclosing group on `name`. */
function groupText(
  ctx: Ctx,
  node: SpecNode,
  written: string,
  keys: readonly (readonly [string, ScalarValue])[],
): string | null {
  return substitute(ctx, node, written, false, (name) => {
    const key = keys.find(([by]) => by === name);
    if (key !== undefined) return label(key[1]);

    reject(ctx, CODE.badLayout, say('compile.text-spells-no-group', { name }), node);
    return null;
  });
}

/** A formula with each `{{name}}` as that column's cell in `row`; inside a block, a bare name is the instance's first. */
function refs(
  ctx: Ctx,
  node: SpecNode,
  written: string,
  placed: Placed,
  scope: string | null,
  row: number,
): string | null {
  return substitute(ctx, node, written, true, (name) => {
    const find = (wanted: string) => placed.columns.find((one) => one.name === wanted)?.col;
    const col =
      (scope !== null && !name.includes('.') ? find(`${scope}.${name}`) : undefined) ?? find(name);
    if (col !== undefined) return addrAt({ col, row });

    reject(ctx, CODE.unknownColumn, say('compile.no-such-column', { name }), node);
    return null;
  });
}

/** Replace each `{{name}}`; in a formula a `"…"` string literal is skipped (`docs/spec.md` §25). */
function substitute(
  ctx: Ctx,
  node: SpecNode,
  written: string,
  inFormula: boolean,
  replace: (name: string) => string | null,
): string | null {
  let out = '';
  let quoted = false;
  let index = 0;

  while (index < written.length) {
    const char = written.charAt(index);
    if (inFormula && char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === '{' && written.charAt(index + 1) === '{') {
      const end = written.indexOf('}}', index + 2);
      if (end < 0) {
        reject(ctx, CODE.badLayout, say('compile.unclosed-column-ref'), node);
        return null;
      }

      const spelled = replace(written.slice(index + 2, end));
      if (spelled === null) return null;
      out += spelled;
      index = end + 2;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

function origin(node: SpecNode, layout: Layout): FacetOrigin {
  return { kind: 'layout', node: node.id, layout: layout.id };
}

function blankAt(at: A1Addr, style: readonly StyleLayer[], from: FacetOrigin): CompiledCell {
  return {
    at,
    value: null,
    type: null,
    formula: null,
    format: null,
    rich: null,
    style,
    provenance: { value: from, format: null },
  };
}

/**
 * Where something anchored sits on `sheet`: its cell, or `gap` rows under a
 * named layout's last row there, in its first column (`docs/spec.md` §25).
 */
export function anchored(ctx: Ctx, at: Anchor, node: SpecNode, sheet: SheetName): A1Addr | null {
  if (typeof at === 'string' || at.kind === 'template') return address(ctx, at, node);

  const placed = ctx.layouts.get(at.layout);
  if (placed === undefined) {
    reject(ctx, CODE.unknownLayout, say('compile.no-such-layout', { name: at.layout }), node);
    return null;
  }
  if (placed.sheet !== sheet) {
    const message = say('compile.layout-on-another-sheet', {
      name: at.layout,
      sheet: placed.sheet,
    });
    reject(ctx, CODE.unknownLayout, message, node);
    return null;
  }
  if (!Number.isInteger(at.gap) || at.gap < 0) {
    reject(ctx, CODE.badLayout, say('compile.gap-must-be-whole'), node);
    return null;
  }

  return addrAt({ col: placed.columns[0]?.col ?? 1, row: placed.lastRow + 1 + at.gap });
}

/** A layout's table, `店舗` — its bottom header row and its body — or a column's body, `店舗.cy`. */
export function namedRange(ctx: Ctx, spelled: string): { sheet: SheetName; rect: Rect } | null {
  for (const [name, placed] of ctx.layouts) {
    const left = placed.columns[0]?.col ?? 1;
    const right = placed.columns[placed.columns.length - 1]?.col ?? left;
    if (spelled === name) {
      const top = placed.depth > 0 ? placed.bodyFirst - 1 : placed.bodyFirst;
      return { sheet: placed.sheet, rect: { top, bottom: placed.bodyLast, left, right } };
    }
    if (!spelled.startsWith(`${name}.`)) continue;

    const column = placed.columns.find((one) => one.name === spelled.slice(name.length + 1));
    if (column === undefined) continue;
    const rect = {
      top: placed.bodyFirst,
      bottom: placed.bodyLast,
      left: column.col,
      right: column.col,
    };
    return { sheet: placed.sheet, rect };
  }
  return null;
}

/** A range that covers cells of `sheet`: written, or a layout on that sheet named (`docs/spec.md` §25). */
export function covered(
  ctx: Ctx,
  at: Templated<string> | Named,
  node: SpecNode,
  sheet: SheetName,
): Rect | null {
  if (typeof at !== 'string' && at.kind === 'named') {
    const found = namedRange(ctx, at.text);
    if (found === null) {
      reject(ctx, CODE.unknownLayout, say('compile.no-such-layout', { name: at.text }), node);
      return null;
    }
    if (found.sheet !== sheet) {
      const message = say('compile.layout-on-another-sheet', { name: at.text, sheet: found.sheet });
      reject(ctx, CODE.unknownLayout, message, node);
      return null;
    }
    return found.rect;
  }

  const spelled = text(ctx, at, node);
  const read = parseA1Range(spelled);
  if (read === null) {
    reject(ctx, CODE.badRange, say('compile.not-a-range', { spelled }), node);
    return null;
  }
  return rectOf(read);
}

/** An override's cell given by meaning: the named layout's column, in the one row `where` finds or the `row`th. */
export function byMeaning(ctx: Ctx, at: ByMeaning, node: SpecNode): QualifiedAddr | null {
  const placed = ctx.layouts.get(at.layout);
  if (placed === undefined) {
    reject(ctx, CODE.unknownLayout, say('compile.no-such-layout', { name: at.layout }), node);
    return null;
  }

  const column = placed.columns.find((one) => one.name === at.column);
  if (column === undefined) {
    reject(ctx, CODE.unknownColumn, say('compile.no-such-column', { name: at.column }), node);
    return null;
  }

  const index =
    at.where === null
      ? counted(ctx, placed, at.row ?? 0, node)
      : matched(ctx, placed, at.where, node);
  if (index === null) return null;

  return { sheet: placed.sheet, at: addrAt({ col: column.col, row: placed.bodyFirst + index }) };
}

function counted(ctx: Ctx, placed: Placed, row: number, node: SpecNode): number | null {
  const rows = placed.bodyLast - placed.bodyFirst + 1;
  if (Number.isInteger(row) && row >= 1 && row <= rows) return row - 1;

  reject(ctx, CODE.badLayout, say('compile.no-such-body-row', { row, rows }), node);
  return null;
}

function matched(
  ctx: Ctx,
  placed: Placed,
  where: readonly (readonly [string, ScalarValue])[],
  node: SpecNode,
): number | null {
  const fields: [number, ScalarValue][] = [];
  for (const [name, value] of where) {
    const field = placed.inputs.findIndex((one) => one.name === name);
    if (field < 0) {
      reject(ctx, CODE.unknownColumn, say('compile.not-an-input-column', { name }), node);
      return null;
    }
    fields.push([field, value]);
  }

  const found = [...placed.data.entries()]
    .filter(([, row]) => fields.every(([field, value]) => (row[field] ?? null) === value))
    .map(([index]) => index);
  if (found.length === 1) return found[0] ?? null;

  reject(ctx, CODE.badLayout, say('compile.where-matches', { count: found.length }), node);
  return null;
}

/** A range that may name another sheet, written or given as a layout's name. */
export function readRange(
  ctx: Ctx,
  spelled: string,
  node: SpecNode,
): { sheet: SheetName | null; rect: Rect } | null {
  const named = namedRange(ctx, spelled);
  if (named !== null) return named;

  const read = parseQualifiedRange(spelled);
  if (read === null) {
    reject(ctx, CODE.badRange, say('compile.not-a-range', { spelled }), node);
    return null;
  }
  return { sheet: read.sheet, rect: rectOf(read.at) };
}
