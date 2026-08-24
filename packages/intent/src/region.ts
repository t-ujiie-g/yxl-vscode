import { type CompiledSheet, cellAt } from '@yxl-vscode/compile';
import type { Op } from '@yxl-vscode/cst';
import { KEY } from '@yxl-vscode/spec';
import { addrAt, overlapping, type Rect, rangeOf, type SheetName } from '@yxl-vscode/units';
import { nothingChanges } from '@yxl-vscode/verify';
import { type Anchored, anchored, putEntry, takeEntries } from './anchored';
import { type Intent, type Projection, type Reading, refused, writtenSheet } from './direct';

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
  const found = writtenSheet(spec, where.sheet, read);
  if (found.kind === 'refused') return found;

  const holds = anchored(found, KEY.tables, where.rect);
  const ops = where.on
    ? putting(spec, found.sheet, where.rect, holds)
    : takeEntries(holds, 'nothing here is part of a table');

  if ('why' in ops) return refused(ops.why);

  return { kind: 'edit', file: found.file, patch: ops, expects: nothingChanges };
}

function putting(
  spec: Projection,
  sheet: CompiledSheet,
  rect: Rect,
  holds: Anchored,
): { ops: readonly Op[] } | { why: string } {
  const why = wrong(sheet, rect, holds);
  if (why !== null) return { why };

  const body = `${KEY.at}: ${rangeOf(rect)}\n${KEY.name}: ${freeName(spec)}`;
  return { ops: [putEntry(holds, body)] };
}

/** Why this region cannot hold a table — Excel's own rules, refused before Excel repairs them. */
function wrong(sheet: CompiledSheet, rect: Rect, holds: Anchored): string | null {
  if (holds.touched.length > 0) {
    return `\`${rangeOf(rect)}\` is already part of a table, and tables may not overlap`;
  }
  if (sheet.filter !== null && overlapping(sheet.filter, rect)) {
    return `\`${rangeOf(rect)}\` is under this sheet's filter, and a table carries its own`;
  }
  if (rect.bottom === rect.top) {
    return 'a table needs a row under its header, and this is one row';
  }

  return heading(sheet, rect);
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
