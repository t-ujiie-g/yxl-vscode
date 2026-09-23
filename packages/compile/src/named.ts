import type { Anchor, ByMeaning, Named, ScalarValue, SpecNode, Templated } from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  parseA1Range,
  parseQualifiedRange,
  type QualifiedAddr,
  type Rect,
  rectOf,
  type SheetName,
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
    const { left, right } = edges(placed);
    const top = placed.depth > 0 ? placed.bodyFirst - 1 : placed.bodyFirst;
    const body = (col: number) => ({
      top: placed.bodyFirst,
      bottom: placed.bodyLast,
      left: col,
      right: col,
    });
    return [
      { name, sheet: placed.sheet, rect: { top, bottom: placed.bodyLast, left, right } },
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
  const found = definedNames(ctx).find((one) => one.name === spelled);
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
