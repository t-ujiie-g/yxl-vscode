import {
  type CompiledCell,
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  resolve,
  styleAt,
} from '@yxl-vscode/compile';
import type { StyleValues } from '@yxl-vscode/spec';
import { type A1Addr, addrAt, type SheetName } from '@yxl-vscode/units';

/**
 * One thing an edit changed, in the terms a reader would recognise.
 *
 * A cell is named by what about it moved — a value, a formula, a number format,
 * a look — because "this cell changed" is not enough to answer *was that what I
 * asked for*.
 */
export type Change =
  | {
      readonly kind: 'cell';
      readonly sheet: SheetName;
      readonly at: A1Addr;
      readonly what: 'value' | 'formula' | 'format' | 'style';
    }
  | { readonly kind: 'sheet'; readonly name: SheetName; readonly what: 'added' | 'removed' };

/** How a cell is named in a claim about what an edit may change. */
export function changedAt(sheet: SheetName, at: A1Addr): string {
  return `${sheet}!${at}`;
}

/**
 * Everything two compilations of a spec disagree about.
 *
 * This is what the verification loop compares against the patch's own claim
 * (ADR-009): the edit says which cells it is for, and anything else that moved
 * is the surprise the gate exists to catch.
 *
 * It answers for the addresses the projection *holds* — every cell either
 * compilation wrote, and the cells a `formulas:` range covers. A band's look
 * over an address nothing writes is not compared, for the same reason `reaches`
 * cannot count it: neither side has a cell there to compare.
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

/**
 * What a cell holds, with no cell and an empty cell saying the same thing.
 *
 * They look the same to a reader, so they compare the same here: a cell that
 * arrives holding nothing has not changed anything about the grid.
 */
function held(cell: CompiledCell | null) {
  return {
    value: cell?.value ?? null,
    formula: cell?.formula ?? null,
    format: cell?.format ?? null,
  };
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
 * How many addresses one comparison will look at.
 *
 * A `formulas:` range can cover a million cells, and comparing them one at a
 * time would make every edit to such a spec take a second. What is dropped is
 * addresses *inside a range* past the limit — where both sides hold the same
 * formula, shifted the same way, unless the range itself was the edit.
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
