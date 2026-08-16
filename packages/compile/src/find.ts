import { type A1Addr, cellOf } from '@yxl-vscode/units';
import type { CompiledSheet } from './grid';

/**
 * Every address of a sheet holding `text`, in reading order and matched without
 * case. What a cell *holds* is searched — its value and its formula — not the
 * number format it is shown through.
 */
export function finds(sheet: CompiledSheet, text: string): A1Addr[] {
  const wanted = text.toLowerCase();
  if (wanted === '') return [];

  const at: A1Addr[] = [];
  for (const cell of sheet.cells.values()) {
    if (holds(cell.value, wanted) || holds(cell.formula, wanted)) at.push(cell.at);
  }

  // A `formulas:` range is one formula for many cells, and the one place a
  // reader can act on it is the anchor it is written at.
  for (const fill of sheet.fills) {
    if (fill.formula.toLowerCase().includes(wanted)) at.push(fill.anchor);
  }

  return [...new Set(at)].sort(reading);
}

function holds(value: string | number | boolean | null, wanted: string): boolean {
  return value !== null && String(value).toLowerCase().includes(wanted);
}

/** Down the rows and along each, which is the order a reader would go through them. */
function reading(one: A1Addr, two: A1Addr): number {
  const here = cellOf(one);
  const there = cellOf(two);

  return here.row === there.row ? here.col - there.col : here.row - there.row;
}
