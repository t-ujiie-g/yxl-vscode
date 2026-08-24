import {
  addressesIn,
  type CompiledCell,
  type CompiledSheet,
  cellAt,
  REACH,
} from '@yxl-vscode/compile';
import {
  type A1Addr,
  cellOf,
  type Line,
  type NodeId,
  type Rect,
  shifted,
  spanSaid,
} from '@yxl-vscode/units';

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
 * the edit would touch, which is the size a reader is deciding about (§4.4).
 */
export interface Shift {
  readonly moves: readonly Moving[];
  readonly stops: readonly string[];
}

/** Everything a line drawn in this sheet would move, counted before any of it is written. */
export function shifting(sheet: CompiledSheet, line: Line): Shift {
  const moves: Moving[] = [];
  const stops: string[] = [];
  const of = along(line);

  for (const at of addressesIn(sheet, REACH)) {
    const cell = cellAt(sheet, at);
    if (cell === null) continue;

    const does = of.at(cellOf(at));
    if (does !== null && cell.provenance.value.kind === 'literal') {
      moves.push({ of: 'cell', node: cell.provenance.value.node, at, does });
    }

    // A cell the line takes away is not asked to survive it: its formula goes
    // with it, which is what Excel does rather than leaving `#REF!`.
    if (does === 'goes') continue;

    const why = keeps(sheet, cell, line);
    if (why !== null) stops.push(why);
  }

  for (const block of blocks(sheet)) {
    const does = of.over(block.rect);
    if (does === null) continue;
    if ((does === 'grows' || does === 'shrinks') && block.file !== null) {
      stops.push(`the rows here come from \`${block.file}\`, which this cannot open a gap in`);
      continue;
    }

    moves.push({ of: 'data', node: block.node, at: null, does });
  }

  for (const fill of sheet.fills) {
    const does = of.over(fill.rect);
    if (does !== null) moves.push({ of: 'formulas', node: fill.node, at: null, does });
  }

  for (const merge of sheet.merges) {
    const does = of.over(merge.rect);
    if (does !== null) moves.push({ of: 'merge', node: merge.node, at: null, does });
  }

  for (const band of line.axis === 'column' ? sheet.columns : sheet.rows) {
    const does = of.run(band.first, band.last);
    if (does !== null) moves.push({ of: 'band', node: band.node, at: null, does });
  }

  if (sheet.freeze !== null) {
    const does = of.at(cellOf(sheet.freeze));
    if (does !== null) moves.push({ of: 'freeze', node: sheet.node, at: sheet.freeze, does });
  }

  return { moves, stops };
}

/** Whether a cell's formula could be written again where the line leaves it, and why not. */
function keeps(sheet: CompiledSheet, cell: CompiledCell, line: Line): string | null {
  if (cell.formula === null) return null;

  const done = shifted(cell.formula, sheet.name, line);
  return done.ok ? null : `\`${cell.at}\` holds \`=${cell.formula}\`, and ${done.why}`;
}

/** One `data:` block, as the cells it laid down say where it reaches. */
export interface Block {
  readonly node: NodeId;
  readonly rect: Rect;
  readonly file: string | null;
}

/** Every `data:` block on a sheet, each as the rectangle its cells actually cover. */
export function blocks(sheet: CompiledSheet): Block[] {
  const found = new Map<NodeId, { rect: Rect; file: string | null }>();

  for (const cell of sheet.cells.values()) {
    const from = cell.provenance.value;
    if (from.kind !== 'inline' && from.kind !== 'external') continue;

    const { col, row } = cellOf(cell.at);
    const held = found.get(from.node);
    const file = from.kind === 'external' ? from.file : null;
    if (held === undefined) {
      found.set(from.node, { rect: { top: row, left: col, bottom: row, right: col }, file });
      continue;
    }

    held.rect = {
      top: Math.min(held.rect.top, row),
      left: Math.min(held.rect.left, col),
      bottom: Math.max(held.rect.bottom, row),
      right: Math.max(held.rect.right, col),
    };
  }

  return [...found].map(([node, one]) => ({ node, rect: one.rect, file: one.file }));
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

/** The run a line covers, as the reader sees it named: one row inserted, or the rows a delete takes. */
export function lineSaid(line: Line): string {
  const last = line.by < 0 ? line.at - line.by - 1 : line.at;

  return spanSaid(line.axis, line.at, last);
}
