import type { CompiledGrid, CompiledSheet } from '@yxl-vscode/compile';
import {
  type A1Addr,
  addrAt,
  cellOf,
  names,
  qualified,
  type SheetName,
  sheetName,
} from '@yxl-vscode/units';
import type { Asked, Computed, Engine, Held, HeldSheet } from './engine';

/**
 * What a workbook's formulas came to, display only (ADR-014). `stopped` is a
 * sheet too large for the limit, and then nothing on it is computed: a half-
 * computed total is a wrong number.
 */
export interface Evaluation {
  readonly values: ReadonlyMap<string, Computed>;
  readonly stopped: boolean;
  readonly limit: number;
  readonly unknown: readonly string[];
}

/**
 * Compute every formula, in as many passes as it takes to settle: no dependency
 * graph, so passes are the depth of the deepest chain. What has not settled by
 * `PASSES` — a circular reference — is uncomputable rather than a latest guess.
 */
export function evaluate(grid: CompiledGrid, engine: Engine, limit = LIMIT): Evaluation {
  const held = new Map<SheetName, Held[]>();
  const asked: Asked[] = [];
  const deep = new Map(grid.sheets.map((sheet) => [named(sheet), lastRow(sheet)]));
  for (const sheet of grid.sheets) gather(sheet, held, asked, deep);

  if (asked.length > limit) return { values: new Map(), stopped: true, limit, unknown: [] };

  const doubted = doubt(asked, engine);
  const computed = new Map<SheetName, Map<A1Addr, Computed>>();
  const answer = (one: Asked, said: Computed): void => {
    const sheet = computed.get(one.sheet) ?? new Map<A1Addr, Computed>();
    sheet.set(one.at, said);
    computed.set(one.sheet, sheet);
  };

  for (const one of asked) {
    const why = doubted.why.get(one.sheet);
    if (why !== undefined) answer(one, { kind: 'unsupported', why });
  }

  const computable = asked.filter((one) => !doubted.why.has(one.sheet));
  for (let pass = 0; pass < PASSES; pass += 1) {
    engine.holds(book(held, computed));

    let settled = true;
    for (const one of computable) {
      const before = computed.get(one.sheet)?.get(one.at);
      const now = engine.compute(one);
      if (!same(before, now)) settled = false;
      answer(one, now);
    }

    if (settled) {
      return { values: flat(computed), stopped: false, limit, unknown: doubted.unknown };
    }
  }

  for (const one of computable) {
    if (computed.get(one.sheet)?.get(one.at)?.kind === 'value') {
      answer(one, { kind: 'unsupported', why: 'this never settles — it may be circular' });
    }
  }

  return { values: flat(computed), stopped: false, limit, unknown: doubted.unknown };
}

/** The answers as one map, which is how a consumer asks about one address. */
function flat(computed: ReadonlyMap<SheetName, ReadonlyMap<A1Addr, Computed>>) {
  const values = new Map<string, Computed>();
  for (const [sheet, cells] of computed) {
    for (const [at, said] of cells) values.set(qualified(sheet, at), said);
  }
  return values;
}

/**
 * Which sheets cannot be computed, and what is missing: without a dependency
 * graph the line is the sheet, and doubt crosses wherever one reads (ADR-025).
 */
function doubt(
  asked: readonly Asked[],
  engine: Engine,
): { why: Map<SheetName, string>; unknown: string[] } {
  const unknown = new Map<SheetName, Set<string>>();
  const reads = new Map<SheetName, Set<SheetName>>();

  for (const one of asked) {
    const said = engine.about(one);
    const names = unknown.get(one.sheet) ?? new Set<string>();
    const from = reads.get(one.sheet) ?? new Set<SheetName>();

    for (const name of said.unknown) names.add(name);
    for (const sheet of said.reads) from.add(sheet);

    unknown.set(one.sheet, names);
    reads.set(one.sheet, from);
  }

  const why = new Map<SheetName, string>();
  for (const [sheet, names] of unknown) {
    if (names.size > 0) {
      why.set(sheet, `this sheet names ${said(names)}, which this preview does not model`);
    }
  }

  for (let pass = 0; pass < unknown.size; pass += 1) {
    const spread = [...reads].filter(
      ([sheet, from]) => !why.has(sheet) && [...from].some((one) => why.has(one)),
    );
    if (spread.length === 0) break;

    for (const [sheet] of spread) {
      why.set(sheet, 'this sheet reads one whose formulas could not be computed');
    }
  }

  return {
    why,
    unknown: [...new Set([...unknown.values()].flatMap((names) => [...names]))].sort(),
  };
}

/** A list of names as a reader would say it. */
function said(names: ReadonlySet<string>): string {
  const all = [...names].map((name) => `\`${name}\``);
  if (all.length <= 2) return all.join(' and ');

  return `${all.slice(0, 2).join(', ')} and ${all.length - 2} more`;
}

/** How many formulas one call will compute, and how many passes it will take. */
const LIMIT = 20_000;
const PASSES = 20;

/** The cells one sheet holds and the formulas it asks for, over the box the sheet writes: `D2:D1048576` is legal. */
function gather(
  sheet: CompiledSheet,
  held: Map<SheetName, Held[]>,
  asked: Asked[],
  deep: ReadonlyMap<SheetName, number>,
): void {
  const name = named(sheet);
  const holds = held.get(name) ?? [];
  held.set(name, holds);

  let columns = 0;

  for (const cell of sheet.cells.values()) {
    const { col } = cellOf(cell.at);
    columns = Math.max(columns, col);

    if (cell.formula !== null) {
      asked.push({ sheet: name, at: cell.at, formula: cell.formula, offset: [0, 0] });
    } else if (cell.value !== null) {
      holds.push({ at: cell.at, value: cell.value });
    }
  }

  for (const merge of sheet.merges) columns = Math.max(columns, merge.rect.right);

  // A range's columns are the spec's; its rows run out where the cells it reads do.
  for (const fill of sheet.fills) columns = Math.max(columns, fill.rect.right);

  for (const fill of sheet.fills) {
    const anchor = cellOf(fill.anchor);
    const rect = fill.rect;
    const rows = reaching(fill.formula, name, deep);

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
function book(
  held: ReadonlyMap<SheetName, Held[]>,
  computed: ReadonlyMap<SheetName, ReadonlyMap<A1Addr, Computed>>,
): HeldSheet[] {
  return [...held].map(([name, cells]) => ({
    name,
    cells: [...cells, ...settled(computed.get(name))],
  }));
}

function settled(cells: ReadonlyMap<A1Addr, Computed> | undefined): Held[] {
  const held: Held[] = [];
  for (const [at, said] of cells ?? []) {
    if (said.kind === 'value') held.push({ at, value: said.value });
  }
  return held;
}

function same(before: Computed | undefined, now: Computed): boolean {
  if (before === undefined) return false;
  if (before.kind !== now.kind) return false;
  if (before.kind === 'value' && now.kind === 'value') return before.value === now.value;
  if (before.kind === 'error' && now.kind === 'error') return before.error === now.error;
  return true;
}

function named(sheet: CompiledSheet): SheetName {
  return sheetName(sheet.name) ?? (sheet.name as SheetName);
}

/** The last row a sheet writes itself, which is where the cells reading it run out. */
function lastRow(sheet: CompiledSheet): number {
  let rows = 0;
  for (const cell of sheet.cells.values()) rows = Math.max(rows, cellOf(cell.at).row);
  for (const merge of sheet.merges) rows = Math.max(rows, merge.rect.bottom);

  return rows;
}

/** How far down a range computes: the last row written on any sheet its formula reads. */
function reaching(formula: string, own: SheetName, deep: ReadonlyMap<SheetName, number>): number {
  let far = deep.get(own) ?? 0;
  for (const [sheet, rows] of deep) {
    if (sheet !== own && names(formula, sheet)) far = Math.max(far, rows);
  }

  return far;
}
