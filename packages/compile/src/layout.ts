import type { Saying } from '@yxl-vscode/diag';
import type { ColumnType, DataRow, Layout, ScalarValue, Sheet, StyleUse } from '@yxl-vscode/spec';
import { cellOf, type SheetName } from '@yxl-vscode/units';
import { CODE } from './codes';
import { type Ctx, filled, openData, reject } from './ctx';
import { lines } from './footer';
import { anchored, definedNames } from './named';
import type { Column, FooterLine, Placed, Taken } from './placed';
import { dateSerial, durationSerial } from './serial';
import { infer, readHeadedCsv, readJson } from './table';
import { say } from './text';

/** Excel's grid ends here. */
const LAST_ROW = 1_048_576;

/** Place every sheet's layouts in the order written, before any sheet is drawn (`docs/spec.md` §25). */
export function placeAll(ctx: Ctx, sheets: readonly (readonly [SheetName, Sheet])[]): void {
  const claimed = new Set<string>();

  for (const [name, sheet] of sheets) {
    for (const layout of sheet.layouts) {
      const placed = place(ctx, layout, name);
      if (placed === null) continue;

      ctx.placed.set(layout.id, placed);
      if (layout.name === null) continue;

      const folded = layout.name.toLowerCase();
      if (claimed.has(folded)) {
        reject(
          ctx,
          CODE.badLayout,
          say('compile.layout-named-twice', { name: layout.name }),
          layout,
        );
        continue;
      }
      claimed.add(folded);
      ctx.layouts.set(layout.name, placed);
    }
  }

  for (const one of definedNames(ctx)) ctx.names.set(one.name, one);
}

function place(ctx: Ctx, layout: Layout, sheet: SheetName): Placed | null {
  const at = anchored(ctx, layout.at, layout, sheet);
  if (at === null) return null;

  const corner = cellOf(at);
  const columns = expand(ctx, layout, corner.col);
  if (columns === null) return null;

  const inputs = columns.filter((one) => one.spec.formula === null);
  const got = rowsOf(ctx, layout, inputs);
  if (got === null) return null;
  const data = typed(ctx, layout, inputs, got.rows);
  if (data === null) return null;

  const rows = bodyRows(ctx, layout, data);
  if (rows === null) return null;

  const depth = Math.max(0, ...columns.map((one) => one.header.length));
  const styles = headerStyles(layout).length;
  if (styles > 0 && depth === 0) {
    reject(ctx, CODE.badLayout, say('compile.header-style-with-no-header'), layout);
  }
  if (styles > depth && depth > 0) {
    reject(
      ctx,
      CODE.badLayout,
      say('compile.header-styles-past-header', { styles, depth }),
      layout,
    );
  }
  if (layout.headerMerge !== null && depth === 0 && layout.title === null) {
    reject(ctx, CODE.badLayout, say('compile.header-merge-with-no-header'), layout);
  }
  if (!mergesData(ctx, layout, inputs, data)) return null;
  const breaks = pageBreaks(ctx, layout, inputs, data);
  if (breaks === null) return null;

  const headerFirst = corner.row + (layout.title === null ? 0 : 1);
  const bodyFirst = headerFirst + depth;
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
    taken: got.taken,
    top: corner.row,
    headerFirst,
    depth,
    bodyFirst,
    bodyLast,
    footer,
    lastRow: next === null ? bodyLast : next - 1,
    breaks: breaks.map((index) => bodyFirst + index),
  };
}

/** A layout's `header_style` as one style per header row, top first; the last stands for every row past it. */
export function headerStyles(layout: Layout): readonly StyleUse[] {
  const written = layout.headerStyle;
  if (written === null) return [];
  return 'kind' in written ? [written] : written;
}

/** Each field of a typed column read as its `type` reads it; one it cannot read is refused (`docs/spec.md` §25). */
function typed(
  ctx: Ctx,
  layout: Layout,
  inputs: readonly Column[],
  rows: readonly DataRow[],
): DataRow[] | null {
  const out: DataRow[] = [];
  for (const [index, row] of rows.entries()) {
    const read: ScalarValue[] = [];
    for (const [field, value] of row.entries()) {
      const column = inputs[field];
      const type = column?.spec.type ?? null;
      if (column === undefined || type === null || value === null) {
        read.push(value);
        continue;
      }

      const as = readAsType(ctx, type, value);
      if (as === undefined) {
        const message = say('compile.field-is-not', {
          row: index + 1,
          column: column.name,
          type,
          value: String(value),
        });
        reject(ctx, CODE.badLayout, message, layout);
        return null;
      }
      read.push(as);
    }
    out.push(read);
  }
  return out;
}

/** A field as `type` reads it, or `undefined`; a date or a duration stays the text it was, drawn as its serial. */
function readAsType(ctx: Ctx, type: ColumnType, value: ScalarValue): ScalarValue | undefined {
  switch (type) {
    case 'text':
      return typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
    case 'number': {
      if (typeof value === 'number') return value;
      const read = typeof value === 'string' ? infer(value) : value;
      return typeof read === 'number' ? read : undefined;
    }
    case 'bool':
      if (typeof value === 'boolean') return value;
      return value === 'true' ? true : value === 'false' ? false : undefined;
    case 'date':
      return typeof value === 'string' && dateSerial(value, ctx.from1904) !== null
        ? value
        : undefined;
    case 'duration':
      return typeof value === 'string' && durationSerial(value) !== null ? value : undefined;
  }
}

/** Whether every `merge_equal` column has data to merge (`docs/spec.md` §25). */
function mergesData(
  ctx: Ctx,
  layout: Layout,
  inputs: readonly Column[],
  data: readonly DataRow[],
): boolean {
  const merging = inputs.find((one) => one.spec.mergeEqual);
  if (merging === undefined || data.length > 0) return true;

  reject(ctx, CODE.badLayout, say('compile.merge-with-no-data', { column: merging.name }), layout);
  return false;
}

/** The body rows, counted from 0, whose `page_break_on` column differs from the row above. */
function pageBreaks(
  ctx: Ctx,
  layout: Layout,
  inputs: readonly Column[],
  data: readonly DataRow[],
): number[] | null {
  const name = layout.pageBreakOn;
  if (name === null) return [];

  const field = inputs.findIndex((one) => one.name === name);
  if (field < 0) {
    reject(ctx, CODE.unknownColumn, say('compile.not-an-input-column', { name }), layout);
    return null;
  }
  if (data.length === 0) {
    reject(ctx, CODE.badLayout, say('compile.break-with-no-data'), layout);
    return null;
  }

  const at = (row: number) => data[row]?.[field] ?? null;
  return [...data.keys()].filter((row) => row > 0 && at(row) !== at(row - 1));
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

/** The rows the layout's source holds, over its input columns, and where they were read from. */
function rowsOf(
  ctx: Ctx,
  layout: Layout,
  inputs: readonly Column[],
): { rows: DataRow[]; taken: Taken } | null {
  const inline = (rows: DataRow[] | null) =>
    rows === null ? null : { rows, taken: { file: null, picks: null } };
  const source = layout.source;
  if (source === null) {
    const named = inputs.find((one) => one.spec.field !== null);
    if (named === undefined) return inline([]);

    reject(ctx, CODE.badLayout, say('compile.field-with-no-file', { column: named.name }), layout);
    return null;
  }

  if (source.kind === 'inline') {
    const rows = source.rows.map((row) => row.map((one) => filled(ctx, one, layout).value));
    return inline(positional(ctx, layout, inputs, rows));
  }

  const opened = openData(ctx, source.path, layout);
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
    // A typed column reads the field as written, so `007` stays text.
    const fieldAt = (row: number, pick: number, index: number): ScalarValue => {
      if ((inputs[pick]?.spec.type ?? null) === null) return table.rows[row]?.[index] ?? null;
      const written = table.texts[row]?.[index] ?? '';
      return written === '' ? null : written;
    };
    const rows = table.rows.map((_, row) => picks.map((index, pick) => fieldAt(row, pick, index)));
    return { rows, taken: { file: opened.file, picks } };
  }

  if (objectRows(opened.source)) {
    const table = readJson(
      opened.source,
      inputs.map((one) => one.field),
    );
    if ('problem' in table) return problem(table.problem);
    return { rows: [...table.rows], taken: { file: opened.file, picks: null } };
  }

  const table = readJson(opened.source, null);
  if ('problem' in table) return problem(table.problem);

  const rows = positional(ctx, layout, inputs, table.rows);
  return rows === null ? null : { rows, taken: { file: opened.file, picks: null } };
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
