import type { Saying } from '@yxl-vscode/diag';
import type {
  Anchor,
  ByMeaning,
  Finder,
  LayoutPart,
  Named,
  ScalarValue,
  SpecNode,
  Templated,
} from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  type CellRef,
  parseA1Range,
  parseQualifiedRange,
  type QualifiedAddr,
  type Rect,
  rangeOf,
  rectOf,
  type SheetName,
  within,
} from '@yxl-vscode/units';
import { address } from './cell';
import { CODE } from './codes';
import { type Ctx, reject, text } from './ctx';
import type { CompiledName } from './grid';
import { edges, type Placed } from './placed';
import { say } from './text';

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

  return addrAt({ col: edges(placed).left, row: placed.lastRow + 1 + at.gap });
}

/** Every defined name the named layouts make: each one's table, and each column's body (`docs/spec.md` §25). */
export function definedNames(ctx: Ctx): CompiledName[] {
  return [...ctx.layouts].flatMap(([name, placed]) => {
    const body = (col: number) => ({
      top: placed.bodyFirst,
      bottom: placed.bodyLast,
      left: col,
      right: col,
    });
    return [
      { name, sheet: placed.sheet, rect: tableOf(placed) },
      ...placed.columns.map((column) => ({
        name: `${name}.${column.name}`,
        sheet: placed.sheet,
        rect: body(column.col),
      })),
    ];
  });
}

/** A layout's table, `店舗`, or a column's body, `店舗.cy`, as the defined name it makes. */
function namedRange(ctx: Ctx, spelled: string): { sheet: SheetName; rect: Rect } | null {
  const found = ctx.names.get(spelled);
  return found === undefined ? null : { sheet: found.sheet, rect: found.rect };
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

/** The named layout on `sheet`, or `null` with the reason reported (`docs/spec.md` §25). */
export function layoutHere(
  ctx: Ctx,
  name: string,
  sheet: SheetName,
  node: SpecNode,
): Placed | null {
  const placed = ctx.layouts.get(name);
  if (placed === undefined) {
    reject(ctx, CODE.unknownLayout, say('compile.no-such-layout', { name }), node);
    return null;
  }
  if (placed.sheet !== sheet) {
    const message = say('compile.layout-on-another-sheet', { name, sheet: placed.sheet });
    reject(ctx, CODE.unknownLayout, message, node);
    return null;
  }
  return placed;
}

/** The rows of a layout's title, header, body or footer; `null` where it has none. */
export function partRows(placed: Placed, part: LayoutPart): { first: number; last: number } | null {
  const rows: Record<LayoutPart, { first: number; last: number }> = {
    title: { first: placed.top, last: placed.headerFirst - 1 },
    header: { first: placed.headerFirst, last: placed.bodyFirst - 1 },
    body: { first: placed.bodyFirst, last: placed.bodyLast },
    footer: { first: placed.bodyLast + 1, last: placed.lastRow },
  };
  const found = rows[part];
  return found.first <= found.last ? found : null;
}

/** A layout's table: its bottom header row, or its first body row, down to its last body row. */
export function tableOf(placed: Placed): Rect {
  const { left, right } = edges(placed);
  const top = placed.depth > 0 ? placed.bodyFirst - 1 : placed.bodyFirst;
  return { top, bottom: placed.bodyLast, left, right };
}

/** All of a layout: its title and header rows, the body and the footer. */
export function extentOf(placed: Placed): Rect {
  const { left, right } = edges(placed);
  return { top: placed.top, bottom: placed.lastRow, left, right };
}

/**
 * A cell given by meaning: a named layout's column in the row its finder names,
 * or its title. One a merge covers is refused (`docs/spec.md` §25).
 */
export function byMeaning(ctx: Ctx, at: ByMeaning, node: SpecNode): QualifiedAddr | null {
  const placed = ctx.layouts.get(at.layout);
  if (placed === undefined) {
    reject(ctx, CODE.unknownLayout, say('compile.no-such-layout', { name: at.layout }), node);
    return null;
  }

  const cell = locate(ctx, placed, at, node);
  if (cell === null) return null;

  const inside = (ctx.merged.get(placed.layout.id) ?? []).find(
    (rect) => within(cell, rect) && (cell.col !== rect.left || cell.row !== rect.top),
  );
  if (inside !== undefined) {
    reject(ctx, CODE.badLayout, say('compile.inside-a-merge', { range: rangeOf(inside) }), node);
    return null;
  }
  return { sheet: placed.sheet, at: addrAt(cell) };
}

function locate(ctx: Ctx, placed: Placed, at: ByMeaning, node: SpecNode): CellRef | null {
  const { finds } = at;
  if (finds.kind === 'title') {
    if (placed.headerFirst > placed.top) return { col: edges(placed).left, row: placed.top };
    reject(ctx, CODE.badLayout, say('compile.no-title'), node);
    return null;
  }

  const column = placed.columns.find((one) => one.name === at.column);
  if (column === undefined) {
    reject(ctx, CODE.unknownColumn, say('compile.no-such-column', { name: at.column ?? '' }), node);
    return null;
  }

  const row = rowOf(ctx, placed, finds, node);
  return row === null ? null : { col: column.col, row };
}

function rowOf(
  ctx: Ctx,
  placed: Placed,
  finds: Exclude<Finder, { kind: 'title' }>,
  node: SpecNode,
): number | null {
  switch (finds.kind) {
    case 'where': {
      const index = matched(ctx, placed, finds.pairs, node);
      return index === null ? null : placed.bodyFirst + index;
    }
    case 'row': {
      const rows = placed.bodyLast - placed.bodyFirst + 1;
      const said = say('compile.no-such-body-row', { row: finds.count, rows });
      return counted(ctx, placed.bodyFirst, finds.count, rows, said, node);
    }
    case 'header': {
      const rows = placed.depth;
      const said =
        rows === 0
          ? say('compile.no-such-part', { part: 'header', name: placed.layout.name ?? '' })
          : say('compile.no-such-header-row', { row: finds.count, rows });
      return counted(ctx, placed.headerFirst, finds.count, rows, said, node);
    }
    case 'footer': {
      const rows = placed.lastRow - placed.bodyLast;
      if (rows === 0) {
        reject(ctx, CODE.badLayout, say('compile.no-footer'), node);
        return null;
      }
      if (finds.count === 'last') return placed.lastRow;
      const said = say('compile.no-such-footer-row', { row: finds.count, rows });
      return counted(ctx, placed.bodyLast + 1, finds.count, rows, said, node);
    }
  }
}

/** The `count`th of `rows` rows from `first`, or `null` with `said` reported. */
function counted(
  ctx: Ctx,
  first: number,
  count: number,
  rows: number,
  said: Saying,
  node: SpecNode,
): number | null {
  if (Number.isInteger(count) && count >= 1 && count <= rows) return first + count - 1;

  reject(ctx, CODE.badLayout, said, node);
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
