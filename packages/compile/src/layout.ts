import type { Saying } from '@yxl-vscode/diag';
import type { DataRow, Layout, Sheet } from '@yxl-vscode/spec';
import { cellOf, type SheetName } from '@yxl-vscode/units';
import { CODE } from './codes';
import { type Ctx, filled, openData, reject } from './ctx';
import { lines } from './footer';
import { anchored, definedNames } from './named';
import type { Column, FooterLine, Placed, Taken } from './placed';
import { readHeadedCsv, readJson } from './table';
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
  const data = got.rows;

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
    taken: got.taken,
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
    const rows = table.rows.map((row) => picks.map((index) => row[index] ?? null));
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
