import { type CompiledSheet, cellAt, sheetOf } from '@yxl-vscode/compile';
import { entryOf, type Node, type Op, type Path } from '@yxl-vscode/cst';
import { KEY } from '@yxl-vscode/spec';
import {
  addrAt,
  overlapping,
  parseA1Range,
  type Rect,
  rangeOf,
  rectOf,
  type SheetName,
} from '@yxl-vscode/units';
import { nothingChanges } from '@yxl-vscode/verify';
import { type Intent, located, type Projection, type Reading, refused } from './direct';

/** A region a gesture asked to be a table, or `on: false` to take off the ones it touches. */
export interface Tabled {
  readonly sheet: SheetName;
  readonly rect: Rect;
  readonly on: boolean;
}

/**
 * A `tables:` entry over a region, or the ones it touches taken off. What a
 * region has to be to hold a table is `docs/spec.md` §11.
 */
export function tableOver(spec: Projection, where: Tabled, read: Reading): Intent {
  const sheet = sheetOf(spec.grid, where.sheet);
  if (sheet === null) return refused(`there is no sheet named \`${where.sheet}\``);

  const found = located(sheet.node, read);
  if (found.kind === 'refused') return found;
  if (found.node.kind !== 'map') return refused(`\`${where.sheet}\` is not written as a sheet`);

  const written = entryOf(found.node, KEY.tables)?.value ?? null;
  const items = written?.kind === 'seq' ? written.items : [];
  const under: Path = [...found.path, KEY.tables];
  const touched = items
    .map((item, index) => ({ index, rect: rectAt(item) }))
    .filter((one) => one.rect !== null && overlapping(one.rect, where.rect));

  const ops = where.on
    ? putting(spec, sheet, where.rect, touched.length > 0, {
        under,
        sheet: found.path,
        many: items.length,
      })
    : taken(touched, items.length, under);

  if ('why' in ops) return refused(ops.why);

  return { kind: 'edit', file: found.file, patch: ops, expects: nothingChanges };
}

/** Where in the sheet the tables are written, and how many are there already. */
interface Where {
  readonly under: Path;
  readonly sheet: Path;
  readonly many: number;
}

function putting(
  spec: Projection,
  sheet: CompiledSheet,
  rect: Rect,
  overlaps: boolean,
  where: Where,
): { ops: readonly Op[] } | { why: string } {
  if (overlaps) {
    return { why: `\`${rangeOf(rect)}\` is already part of a table, and tables may not overlap` };
  }
  if (sheet.filter !== null && overlapping(sheet.filter, rect)) {
    return {
      why: `\`${rangeOf(rect)}\` is under this sheet's filter, and a table carries its own`,
    };
  }
  if (rect.bottom === rect.top) {
    return { why: 'a table needs a row under its header, and this is one row' };
  }

  const named = heading(sheet, rect);
  if (named !== null) return { why: named };

  const listed = `${KEY.at}: ${rangeOf(rect)}\n${KEY.name}: ${freeName(spec)}`;
  const op: Op =
    where.many === 0
      ? { op: 'addSource', path: where.sheet, key: KEY.tables, source: itemOf(listed) }
      : { op: 'insertSource', path: where.under, index: where.many, source: listed };

  return { ops: [op] };
}

/** Why the top row does not name the columns, a table's own rule; `null` where it does. */
function heading(sheet: CompiledSheet, rect: Rect): string | null {
  const seen = new Map<string, string>();

  for (let col = rect.left; col <= rect.right; col += 1) {
    const at = addrAt({ col, row: rect.top });
    const value = cellAt(sheet, at)?.value ?? null;
    if (typeof value !== 'string' || value === '') {
      return `\`${at}\` names no column, and a table's top row names every one of them`;
    }

    const already = seen.get(value.toLowerCase());
    if (already !== undefined) {
      return `\`${already}\` names two columns, and a table's column names differ`;
    }
    seen.set(value.toLowerCase(), value);
  }

  return null;
}

/** The tables a range touches, taken out; the key goes with the last of them. */
function taken(
  touched: readonly { readonly index: number }[],
  all: number,
  under: Path,
): { ops: readonly Op[] } | { why: string } {
  if (touched.length === 0) return { why: 'nothing here is part of a table' };
  if (touched.length === all) return { ops: [{ op: 'remove', path: under }] };

  return { ops: touched.map((one) => ({ op: 'remove', path: [...under, one.index] })) };
}

/** The first `Table<n>` no table in the workbook has, which is the name Excel gives a new one. */
function freeName(spec: Projection): string {
  const taken = new Set(
    spec.grid.sheets.flatMap((sheet) => sheet.tables.map((one) => one.name?.toLowerCase() ?? '')),
  );

  for (let n = 1; ; n += 1) {
    const name = `Table${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/** The range one entry covers, as the file writes it; a `${...}` in its place covers nothing here. */
function rectAt(item: Node): Rect | null {
  const written = entryOf(item, KEY.at)?.value ?? null;
  if (written === null || written.kind !== 'scalar' || typeof written.value !== 'string') {
    return null;
  }

  const read = parseA1Range(written.value);
  return read === null ? null : rectOf(read);
}

/** The same entry as the first item of a sequence: `- ` takes two columns, and what follows lines up under it. */
function itemOf(entry: string): string {
  return `- ${entry.split('\n').join('\n  ')}`;
}
