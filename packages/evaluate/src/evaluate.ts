import type { CompiledGrid, CompiledSheet } from '@yxl-vscode/compile';
import { type A1Addr, addrAt, cellOf, type SheetName, sheetName } from '@yxl-vscode/units';
import type { Asked, Computed, Engine, Held, HeldSheet } from './engine';

/**
 * What a workbook's formulas came to, display only (ADR-014).
 *
 * `stopped` is a sheet too large to compute inside the limit it was given.
 * Nothing at all is computed then, rather than the part that fit: a total over
 * a range half of which was computed is a *wrong number*, and a wrong number is
 * worse than no number.
 */
export interface Evaluation {
  readonly values: ReadonlyMap<string, Computed>;
  readonly stopped: boolean;
}

/** How a cell is named in an evaluation, across sheets. */
export function computedAt(sheet: SheetName | string, at: A1Addr): string {
  return `${sheet}!${at}`;
}

/**
 * Compute every formula the grid holds, in as many passes as it takes to settle.
 *
 * There is no dependency graph here. A pass computes every formula against what
 * the last pass knew, and a formula that reads another formula's cell gets its
 * answer on the pass after that one settled — so the number of passes a sheet
 * needs is the depth of its deepest chain. What has not settled by `PASSES` is
 * reported as uncomputable rather than as its latest guess, which is what a
 * circular reference looks like from here.
 */
export function evaluate(grid: CompiledGrid, engine: Engine, limit = LIMIT): Evaluation {
  const held = new Map<SheetName, Held[]>();
  const asked: Asked[] = [];
  for (const sheet of grid.sheets) gather(sheet, held, asked);

  if (asked.length > limit) return { values: new Map(), stopped: true };

  const values = new Map<string, Computed>();
  for (let pass = 0; pass < PASSES; pass += 1) {
    engine.holds(book(held, values));

    let settled = true;
    for (const one of asked) {
      const before = values.get(computedAt(one.sheet, one.at));
      const now = engine.compute(one);
      if (!same(before, now)) settled = false;
      values.set(computedAt(one.sheet, one.at), now);
    }

    if (settled) return { values, stopped: false };
  }

  for (const one of asked) {
    const key = computedAt(one.sheet, one.at);
    const now = values.get(key);
    if (now?.kind === 'value') {
      values.set(key, { kind: 'unsupported', why: 'this never settles — it may be circular' });
    }
  }

  return { values, stopped: false };
}

/** How many formulas one call will compute, and how many passes it will take. */
const LIMIT = 20_000;
const PASSES = 20;

/**
 * The cells one sheet holds and the formulas it asks for.
 *
 * A `formulas:` range is walked only over the box the sheet writes: past that
 * every reference is empty, so Excel's answer there is the answer to a formula
 * over nothing — and `D2:D1048576` is a legal thing to write.
 */
function gather(sheet: CompiledSheet, held: Map<SheetName, Held[]>, asked: Asked[]): void {
  const name = sheetName(sheet.name) ?? (sheet.name as SheetName);
  const holds = held.get(name) ?? [];
  held.set(name, holds);

  let rows = 0;
  let columns = 0;

  for (const cell of sheet.cells.values()) {
    const { row, col } = cellOf(cell.at);
    rows = Math.max(rows, row);
    columns = Math.max(columns, col);

    if (cell.formula !== null) {
      asked.push({ sheet: name, at: cell.at, formula: cell.formula, offset: [0, 0] });
    } else if (cell.value !== null) {
      holds.push({ at: cell.at, value: cell.value });
    }
  }

  for (const merge of sheet.merges) {
    rows = Math.max(rows, merge.rect.bottom);
    columns = Math.max(columns, merge.rect.right);
  }

  // A range's own columns are worth computing wherever they are — the spec
  // wrote them — while its rows are only worth computing where the cells it
  // reads exist, which is why the two bounds are not the same.
  for (const fill of sheet.fills) columns = Math.max(columns, fill.rect.right);

  for (const fill of sheet.fills) {
    const anchor = cellOf(fill.anchor);
    const rect = fill.rect;

    for (let row = rect.top; row <= Math.min(rect.bottom, rows); row += 1) {
      for (let col = rect.left; col <= Math.min(rect.right, columns); col += 1) {
        const at = addrAt({ col, row });
        if (sheet.cells.has(at)) continue;

        asked.push({
          sheet: name,
          at,
          formula: fill.formula,
          offset: [col - anchor.col, row - anchor.row],
        });
      }
    }
  }
}

/** The workbook as the engine is given it: what the spec wrote, and what settled. */
function book(held: ReadonlyMap<SheetName, Held[]>, values: ReadonlyMap<string, Computed>) {
  const sheets: HeldSheet[] = [...held].map(([name, cells]) => ({ name, cells: [...cells] }));

  for (const [key, computed] of values) {
    if (computed.kind !== 'value') continue;

    const cut = key.lastIndexOf('!');
    const sheet = sheets.find((one) => one.name === key.slice(0, cut));
    if (sheet === undefined) continue;
    (sheet.cells as Held[]).push({ at: key.slice(cut + 1) as A1Addr, value: computed.value });
  }

  return sheets;
}

function same(before: Computed | undefined, now: Computed): boolean {
  if (before === undefined) return false;
  if (before.kind !== now.kind) return false;
  if (before.kind === 'value' && now.kind === 'value') return before.value === now.value;
  if (before.kind === 'error' && now.kind === 'error') return before.error === now.error;
  return true;
}
