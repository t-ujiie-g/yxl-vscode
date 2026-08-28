import {
  addressesIn,
  type CompiledCell,
  type CompiledGrid,
  type CompiledRun,
  type CompiledSheet,
  cellAt,
  REACH,
  resolve,
  settled,
  styleAt,
} from '@yxl-vscode/compile';
import type { StyleValues } from '@yxl-vscode/spec';
import type { A1Addr, SheetName } from '@yxl-vscode/units';

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

    if (was.value !== now.value || !sameRuns(was.rich, now.rich)) {
      changes.push({ kind: 'cell', sheet, at, what: 'value' });
    }
    if (was.formula !== now.formula) changes.push({ kind: 'cell', sheet, at, what: 'formula' });
    if (was.format !== now.format) changes.push({ kind: 'cell', sheet, at, what: 'format' });

    if (!alike(settled(resolve(styleAt(before, at))), settled(resolve(styleAt(after, at))))) {
      changes.push({ kind: 'cell', sheet, at, what: 'style' });
    }
  }

  return changes;
}

/** What a cell holds; no cell and an empty cell say the same thing. */
function held(cell: CompiledCell | null) {
  return {
    value: cell?.value ?? null,
    formula: cell?.formula ?? null,
    format: cell?.format ?? null,
    rich: cell?.rich ?? null,
  };
}

/** Whether two cells hold the same runs, which is part of what they hold rather than of how they look. */
function sameRuns(
  before: readonly CompiledRun[] | null,
  after: readonly CompiledRun[] | null,
): boolean {
  if (before === null || after === null) return before === after;
  if (before.length !== after.length) return false;

  return before.every((run, index) => {
    const now = after[index];
    return now !== undefined && run.text === now.text && alike(run.look, now.look);
  });
}

/** Every address either compilation holds a cell at, each named once. */
function addresses(before: CompiledSheet, after: CompiledSheet): A1Addr[] {
  return [...new Set([...addressesIn(before, REACH), ...addressesIn(after, REACH)])] as A1Addr[];
}

function alike(before: StyleValues, after: StyleValues): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    const was = before[key as keyof StyleValues];
    const now = after[key as keyof StyleValues];
    if (was !== now) return false;
  }

  return true;
}
