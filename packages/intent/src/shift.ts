import {
  addressesIn,
  type CompiledCell,
  type CompiledSheet,
  cellAt,
  REACH,
} from '@yxl-vscode/compile';
import type { Saying } from '@yxl-vscode/diag';
import type { Sheet } from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  cellOf,
  type Line,
  type NodeId,
  parseA1Addr,
  type Rect,
  shifted,
} from '@yxl-vscode/units';
import { nameOf, type Projection } from './direct';
import { say } from './text';

/** What a line does to one construct: it moves whole, it takes the line in, or it goes with it. */
export type Does = 'shifts' | 'grows' | 'shrinks' | 'goes';

/** One construct the line reaches, and what becomes of it. */
export interface Moving {
  readonly of: 'cell' | 'data' | 'formulas' | 'merge' | 'band' | 'freeze';
  readonly node: NodeId;
  readonly at: A1Addr | null;
  readonly does: Does;
}

/**
 * What a row or a column being drawn would do to a sheet: every construct it
 * reaches, and what stands in the way. `moves` is one entry per line of YAML
 * the edit would touch, which is the size a reader is deciding about.
 */
export interface Shift {
  readonly moves: readonly Moving[];
  readonly stops: readonly Saying[];
}

/** Everything a line drawn in this sheet would move, counted before any of it is written. */
export function shifting(spec: Projection, sheet: CompiledSheet, line: Line): Shift {
  const moves: Moving[] = [];
  const stops: Saying[] = [];
  const of = along(line);
  const own = ownSheet(spec, line);
  const written = handWritten(own);

  for (const cell of own?.cells ?? []) {
    const at = point(cell.at);
    const does = at === null ? null : of.at(cellOf(at));
    if (does !== null) moves.push({ of: 'cell', node: cell.id, at, does });
  }

  for (const at of addressesIn(sheet, REACH)) {
    const cell = cellAt(sheet, at);
    // A cell the line takes away is not asked to survive it: its formula goes
    // with it, which is what Excel does rather than leaving `#REF!`.
    if (cell === null || of.at(cellOf(at)) === 'goes') continue;

    const why = keeps(sheet, cell, line);
    if (why !== null) stops.push(why);
  }

  for (const block of sheet.blocks) {
    const does = of.over(block.rect);
    if (does === null) continue;
    if ((does === 'grows' || does === 'shrinks') && block.file !== null) {
      stops.push(say('intent.rows-from-file', { file: block.file }));
      continue;
    }

    moves.push({ of: 'data', node: block.node, at: null, does });
  }

  for (const fill of sheet.fills) {
    const does = of.over(fill.rect);
    if (does !== null && written.has(fill.node)) {
      moves.push({ of: 'formulas', node: fill.node, at: null, does });
    }
  }

  for (const merge of sheet.merges) {
    const does = of.over(merge.rect);
    if (does !== null && written.has(merge.node)) {
      moves.push({ of: 'merge', node: merge.node, at: null, does });
    }
  }

  for (const band of line.axis === 'column' ? sheet.columns : sheet.rows) {
    const does = of.run(band.first, band.last);
    if (does !== null && written.has(band.node)) {
      moves.push({ of: 'band', node: band.node, at: null, does });
    }
  }

  if (sheet.freeze !== null && !followsALayout(own)) {
    const does = of.at(cellOf(sheet.freeze));
    if (does !== null) moves.push({ of: 'freeze', node: sheet.node, at: sheet.freeze, does });
  }

  return { moves, stops };
}

/** An address written as one, or `null` where a template or a layout's name stands in its place. */
export function point(at: unknown): A1Addr | null {
  return typeof at === 'string' ? parseA1Addr(at) : null;
}

/** The sheet a line is drawn in, as the spec writes it. */
export function ownSheet(spec: Projection, line: Line): Sheet | undefined {
  return spec.doc.sheets.find((one) => nameOf(one) === line.sheet);
}

/**
 * The ranges, merges and bands a sheet writes by hand; a layout draws its own,
 * and they move with it, as does a row band given as a layout's part.
 */
export function handWritten(own: Sheet | undefined): ReadonlySet<NodeId> {
  const rows = (own?.rows ?? []).filter(
    (one) => typeof one.at === 'string' || one.at.kind !== 'part',
  );
  return new Set(
    [own?.formulas, own?.merges, own?.columns, rows].flatMap(
      (list) => list?.map((one) => one.id) ?? [],
    ),
  );
}

/** Whether the sheet freezes at a layout, which moves with the layout rather than with a line. */
export function followsALayout(own: Sheet | undefined): boolean {
  const at = own?.freeze ?? null;
  return at !== null && typeof at !== 'string' && at.kind === 'layout';
}

/** Whether a cell's formula could be written again where the line leaves it, and why not. */
function keeps(sheet: CompiledSheet, cell: CompiledCell, line: Line): Saying | null {
  if (cell.formula === null) return null;

  const done = shifted(cell.formula, sheet.name, line);
  return done.ok
    ? null
    : say('intent.formula-would-break', { at: cell.at, formula: cell.formula, why: done.why });
}

/** The line, asked what it does to a place, a rectangle, or a run of the axis it is drawn on. */
export interface Along {
  readonly at: (cell: { col: number; row: number }) => Does | null;
  readonly over: (rect: Rect) => Does | null;
  readonly run: (first: number, last: number) => Does | null;
}

export function along(line: Line): Along {
  const columns = line.axis === 'column';
  const taken = line.by < 0 ? { first: line.at, last: line.at - line.by - 1 } : null;

  const one = (at: number): Does | null => {
    if (taken !== null) {
      if (at > taken.last) return 'shifts';
      return at >= taken.first ? 'goes' : null;
    }

    return at >= line.at ? 'shifts' : null;
  };

  const run = (first: number, last: number): Does | null => {
    if (taken !== null) {
      if (first > taken.last) return 'shifts';
      if (last < taken.first) return null;

      return first >= taken.first && last <= taken.last ? 'goes' : 'shrinks';
    }

    if (first >= line.at) return 'shifts';
    return last >= line.at ? 'grows' : null;
  };

  return {
    at: (cell) => one(columns ? cell.col : cell.row),
    over: (rect) => run(columns ? rect.left : rect.top, columns ? rect.right : rect.bottom),
    run,
  };
}

/** One address once the line is drawn. */
export function moved(at: A1Addr, line: Line): A1Addr {
  const cell = cellOf(at);
  const one = line.axis === 'column' ? cell.col : cell.row;

  return line.axis === 'column'
    ? addrAt({ col: one + line.by, row: cell.row })
    : addrAt({ col: cell.col, row: one + line.by });
}

/** A rectangle with the line taken in: the far end moves, the near one stays. */
export function grown(rect: Rect, line: Line, does: string): Rect {
  const near = line.axis === 'column' ? rect.left : rect.top;
  const far = line.axis === 'column' ? rect.right : rect.bottom;
  const run = held(near, far, line, does);

  return line.axis === 'column'
    ? { ...rect, left: run.first, right: run.last }
    : { ...rect, top: run.first, bottom: run.last };
}

/** A run of the axis once the line is drawn: it moves whole, or it takes the line in. */
export function held(
  first: number,
  last: number,
  line: Line,
  does: string,
): { first: number; last: number } {
  if (does === 'shifts') return { first: first + line.by, last: last + line.by };

  const gone =
    line.by < 0 ? Math.min(last, line.at - line.by - 1) - Math.max(first, line.at) + 1 : 0;

  return { first, last: line.by < 0 ? last - gone : last + line.by };
}

/** The run a line covers, as the reader sees it named: one row inserted, or the rows a delete takes. */
