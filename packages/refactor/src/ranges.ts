import { entryOf, nodeAt, type Op, type Path } from '@yxl-vscode/cst';
import { pathOf } from '@yxl-vscode/loader';
import type { Patch } from '@yxl-vscode/patch';
import { type Cell, KEY, type Sheet } from '@yxl-vscode/spec';
import {
  type A1Addr,
  type A1Range,
  cellOf,
  type FilePath,
  moved,
  rangeOf,
} from '@yxl-vscode/units';
import type { Proposing, Ranging, Site } from './proposal';
import { say } from './text';

/** How many cells must translate the same formula before a range says it better. */
export const WORTH_RANGING = 3;

/** One cell of a run, with the formula it writes and the entry it writes it in. */
interface Written extends Site {
  readonly at: A1Addr;
  readonly formula: string;
}

/**
 * Columns whose cells each write the same formula translated to where they sit
 * (`ROADMAP.md` Phase 21) — what a `formulas:` range says in one line. Only
 * cells holding nothing but a formula, since a range carries no look.
 */
export function rangeFormulas(spec: Proposing): readonly Ranging[] {
  const root = spec.doc.file;
  const found: Ranging[] = [];

  for (const sheet of spec.doc.sheets) {
    const where = pathOf(sheet.id);
    if (where === null || where.file !== root) continue;

    for (const run of runs(onlyFormulas(sheet, root))) {
      const first = run[0] as Written;
      const last = run[run.length - 1] as Written;
      const over = across(first, last);

      found.push({
        kind: 'range',
        id: `range.${found.length}`,
        what: say('refactor.write-as-a-range', { many: run.length, at: over }),
        file: root,
        sheet: where.path,
        over,
        formula: first.formula,
        at: run.map((one) => ({ file: one.file, path: one.path })),
        holds: writesRanges(spec, where.path),
      });
    }
  }

  return found;
}

/** Whether the sheet already writes a `formulas:` sequence for a new range to join. */
function writesRanges(spec: Proposing, sheet: Path): boolean {
  const tree = spec.parsed(spec.doc.file);
  const node = tree?.root == null ? null : nodeAt(tree.root, sheet);

  return node !== null && entryOf(node, KEY.formulas) !== undefined;
}

/** The cells of a sheet that hold a formula and nothing else, in the order they are written. */
function onlyFormulas(sheet: Sheet, root: FilePath): readonly Written[] {
  return sheet.cells.flatMap((cell: Cell) => {
    const body = cell.formula;
    if (body === null || body.kind !== 'inline' || typeof cell.at !== 'string') return [];
    if (cell.value !== null || cell.style !== null || cell.format !== null) return [];
    if (cell.rich !== null || cell.type !== null || cell.clearsFormat) return [];

    const where = pathOf(cell.id);
    if (where === null || where.file !== root) return [];

    return [{ file: where.file, path: where.path, at: cell.at, formula: body.body }];
  });
}

/** Runs down one column where each cell writes the one above it translated a row down. */
function runs(cells: readonly Written[]): readonly (readonly Written[])[] {
  const columns = new Map<number, Written[]>();
  for (const one of cells) {
    const col = cellOf(one.at).col;
    columns.set(col, [...(columns.get(col) ?? []), one]);
  }

  const found: Written[][] = [];
  for (const column of columns.values()) {
    const sorted = [...column].sort((a, b) => cellOf(a.at).row - cellOf(b.at).row);
    let run: Written[] = [];

    for (const one of sorted) {
      if (run.length > 0 && follows(run[0] as Written, one, run.length)) {
        run.push(one);
        continue;
      }

      if (run.length >= WORTH_RANGING) found.push(run);
      run = [one];
    }

    if (run.length >= WORTH_RANGING) found.push(run);
  }

  return found;
}

/** Whether a cell sits `rows` below the anchor and writes the anchor's formula moved there. */
function follows(anchor: Written, one: Written, rows: number): boolean {
  const here = cellOf(one.at);
  const from = cellOf(anchor.at);
  if (here.row !== from.row + rows || here.col !== from.col) return false;

  const there = moved(anchor.formula, { cols: 0, rows });
  return there.ok && there.formula === one.formula;
}

function across(first: Written, last: Written): A1Range {
  const from = cellOf(first.at);
  const to = cellOf(last.at);

  return rangeOf({ top: from.row, left: from.col, bottom: to.row, right: to.col });
}

/**
 * The ops that say the run once: the range where the sheet keeps its own, and
 * every cell entry it replaces taken away.
 */
export function rangePatch(one: Ranging): Patch {
  const entry = `{ at: ${one.over}, formula: "${one.formula}" }`;
  const declaring: Op = one.holds
    ? { op: 'insertSource', path: [...one.sheet, KEY.formulas], index: 0, source: entry }
    : { op: 'addSource', path: [...one.sheet], key: KEY.formulas, source: `- ${entry}` };

  const taken: Op[] = one.at.map((at) => ({ op: 'remove', path: at.path }));

  return { ops: [declaring, ...taken] };
}
