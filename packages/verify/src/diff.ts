import {
  type CompiledCell,
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  resolve,
  styleAt,
} from '@yxl-vscode/compile';
import type { StyleValues } from '@yxl-vscode/spec';
import { type A1Addr, addrAt, moved, type SheetName } from '@yxl-vscode/units';

/** One thing an edit changed: a cell, by what about it moved, or a sheet. */
export type Change =
  | {
      readonly kind: 'cell';
      readonly sheet: SheetName;
      readonly at: A1Addr;
      readonly what: 'value' | 'formula' | 'format' | 'style';
    }
  | { readonly kind: 'sheet'; readonly name: SheetName; readonly what: 'added' | 'removed' };

/**
 * Everything two compilations disagree about, over the addresses either holds
 * (ADR-009). A band's look over an empty address is not compared: neither side
 * has a cell there.
 */
export function diff(before: CompiledGrid, after: CompiledGrid): Change[] {
  const changes: Change[] = [];
  const sheets = new Map(after.sheets.map((sheet) => [sheet.name, sheet]));

  for (const sheet of before.sheets) {
    const now = sheets.get(sheet.name);
    if (now === undefined) {
      changes.push({ kind: 'sheet', name: sheet.name, what: 'removed' });
      continue;
    }
    changes.push(...inSheet(sheet, now));
  }

  const had = new Set(before.sheets.map((sheet) => sheet.name));
  for (const sheet of after.sheets) {
    if (!had.has(sheet.name)) changes.push({ kind: 'sheet', name: sheet.name, what: 'added' });
  }

  return changes;
}

function inSheet(before: CompiledSheet, after: CompiledSheet): Change[] {
  const changes: Change[] = [];

  for (const at of addresses(before, after)) {
    const was = held(cellAt(before, at));
    const now = held(cellAt(after, at));
    const sheet = after.name;

    if (was.value !== now.value) changes.push({ kind: 'cell', sheet, at, what: 'value' });
    if (was.formula !== now.formula) changes.push({ kind: 'cell', sheet, at, what: 'formula' });
    if (was.format !== now.format) changes.push({ kind: 'cell', sheet, at, what: 'format' });

    if (!alike(resolve(styleAt(before, at)), resolve(styleAt(after, at)))) {
      changes.push({ kind: 'cell', sheet, at, what: 'style' });
    }
  }

  return changes;
}

/** What a cell holds; no cell and an empty cell say the same thing. */
function held(cell: CompiledCell | null) {
  return {
    value: cell?.value ?? null,
    formula: cell === null ? null : applying(cell),
    format: cell?.format ?? null,
  };
}

/** The formula as it applies where the cell sits, so re-anchoring a range reads as no change (ADR-031). */
function applying(cell: CompiledCell): string | null {
  const origin = cell.provenance.value;
  if (cell.formula === null || origin.kind !== 'formulaRange') return cell.formula;

  const done = moved(cell.formula, { cols: origin.offset[0], rows: origin.offset[1] });
  return done.ok ? done.formula : cell.formula;
}

/** Every address either compilation holds a cell at, each named once. */
function addresses(before: CompiledSheet, after: CompiledSheet): A1Addr[] {
  const all = new Set<string>([...before.cells.keys(), ...after.cells.keys()]);

  for (const sheet of [before, after]) {
    for (const fill of sheet.fills) {
      for (let row = fill.rect.top; row <= fill.rect.bottom; row += 1) {
        for (let col = fill.rect.left; col <= fill.rect.right; col += 1) {
          if (all.size > REACH) return [...all] as A1Addr[];
          all.add(addrAt({ col, row }));
        }
      }
    }
  }

  return [...all] as A1Addr[];
}

/**
 * How many addresses one comparison looks at. Past it, addresses inside a
 * `formulas:` range are dropped: a million cells holding one shifted formula.
 */
const REACH = 50_000;

function alike(before: StyleValues, after: StyleValues): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    const was = before[key as keyof StyleValues];
    const now = after[key as keyof StyleValues];
    if (was !== now) return false;
  }

  return true;
}
