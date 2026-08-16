import {
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  type FacetOrigin,
  type FullAddr,
  reaches,
} from '@yxl-vscode/compile';
import { type Op, type Path, renderScalar } from '@yxl-vscode/cst';
import { type A1Addr, addrAt, cellOf, qualified, type SheetName } from '@yxl-vscode/units';
import { type Intent, located, type Text } from './direct';
import { meant } from './meant';

/**
 * One of the answers an edit has, where it has more than one.
 *
 * A cell whose value no single node of the spec wrote is not a cell that cannot
 * be edited — it is one where the editor must not pick (ADR-001). So each way
 * through is enumerated with what it would do and every cell it would move, and
 * the reader chooses. `overrides:` is the answer that is always available and is
 * offered separately, because it is the exception rather than a resolution
 * (ADR-007).
 *
 * `alone` says this answer is the *whole* answer — nothing is being chosen
 * between, so a caller may take it without asking. That is ADR-001's other
 * half: an edit with one meaning applies, and only an edit with several is a
 * question.
 */
export interface Candidate {
  readonly id: string;
  readonly what: string;
  readonly moves: readonly FullAddr[];
  readonly alone: boolean;
  readonly intent: Intent;
}

/**
 * Every way of making an edit the direct path refused, in the order a reader
 * should consider them: the one that keeps the spec's shape first.
 *
 * Empty where there is nothing to offer, which is not the same as nothing being
 * possible — the override is offered beside this list, not in it.
 */
export function candidates(
  grid: CompiledGrid,
  where: { sheet: SheetName; at: A1Addr },
  typed: string,
  text: Text,
): readonly Candidate[] {
  const sheet = grid.sheets.find((one) => one.name === where.sheet);
  if (sheet === undefined) return [];

  const cell = cellAt(sheet, where.at);
  if (cell === null) {
    const written = newCell(sheet, where, typed, text);
    return written === null ? [] : [written];
  }

  const origin = cell.provenance.value;
  if (origin.kind !== 'formulaRange') return [];

  const written = rangeFormula(grid, origin, typed, text);
  return written === null ? [] : [written];
}

/**
 * Whether a `data:` rectangle sits where this cell would extend it.
 *
 * Above or to the left, which is where a rectangle grown from its own corner
 * reaches this address from. Extending it is the `empty` row's second answer,
 * and where there are two the reader picks (ADR-001) — so this is the question
 * of whether writing a new entry is a choice or the only thing to do.
 */
function beside(sheet: CompiledSheet, at: A1Addr): boolean {
  const cell = cellOf(at);
  const neighbours = [
    { col: cell.col, row: cell.row - 1 },
    { col: cell.col - 1, row: cell.row },
  ];

  return neighbours.some((one) => {
    if (one.row < 1 || one.col < 1) return false;
    const kind = cellAt(sheet, addrAt(one))?.provenance.value.kind;
    return kind === 'inline' || kind === 'external';
  });
}

/**
 * The entry going in, in the shape the file it lands in needs.
 *
 * A formula is a key under the address and a value is the address's own scalar
 * (`docs/spec.md` §3) — two lines against one, which is the difference between
 * the two ops that write into a mapping. Where the sheet has no `cells:` at
 * all, the key goes in with the entry under it.
 */
function entryOp(path: Path, holds: boolean, at: A1Addr, typed: string): Op {
  const formula = typed.startsWith('=') ? renderScalar(typed.slice(1), 'double') : null;

  if (!holds) {
    const source =
      formula === null ? `${at}: ${renderScalar(meant(typed))}` : `${at}:\n  formula: ${formula}`;
    return { op: 'addSource', path, key: 'cells', source };
  }

  return formula === null
    ? { op: 'add', path, key: at, value: meant(typed), before: null }
    : { op: 'addSource', path, key: at, source: `formula: ${formula}` };
}

/**
 * Write a cell the spec has not written before, as a new `cells:` entry.
 *
 * The one answer an address nothing reaches has — and it is still an answer
 * rather than an edit, because a blank cell beside a `data:` rectangle has a
 * second one waiting: extending the rectangle. Offering the first silently
 * would be picking between them (ADR-001).
 *
 * It goes at the end of the mapping. Where a key that was never there *belongs*
 * is a question about how the spec is read, and the end is where a reader looks
 * for what was added.
 */
function newCell(
  sheet: CompiledSheet,
  where: { sheet: SheetName; at: A1Addr },
  typed: string,
  text: Text,
): Candidate | null {
  if (typed === '') return null;

  const found = located(sheet.node, text);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const holds = found.node.entries.some((entry) => entry.key.value === 'cells');
  const op = entryOp(holds ? [...found.path, 'cells'] : found.path, holds, where.at, typed);

  return {
    id: 'newCell',
    what: `Write \`${where.at}\` as a new cell`,
    moves: [{ sheet: where.sheet, at: where.at }],
    alone: !beside(sheet, where.at),
    intent: {
      kind: 'edit',
      file: found.file,
      patch: { ops: [op] },
      expects: { cells: new Set([qualified(where.sheet, where.at)]), beyond: 'refuse' },
    },
  };
}

/**
 * Change the formula a `formulas:` range writes, from the cell it is anchored
 * at (`docs/spec.md` §9).
 *
 * Offered at the anchor only. What a reader types into any other cell of the
 * range is written *for that cell* — `=B3*0.1` typed one row down means
 * `B2*0.1` to the range — and shifting it back is reference translation this
 * editor does not do yet. Offering it there would be the editor guessing at an
 * answer that is off by a row.
 */
function rangeFormula(
  grid: CompiledGrid,
  origin: Extract<FacetOrigin, { kind: 'formulaRange' }>,
  typed: string,
  text: Text,
): Candidate | null {
  if (!typed.startsWith('=')) return null;
  if (origin.offset[0] !== 0 || origin.offset[1] !== 0) return null;

  const found = located(origin.node, text);
  if (found.kind === 'refused') return null;
  if (found.node.kind !== 'map') return null;
  if (!found.node.entries.some((entry) => entry.key.value === 'formula')) return null;

  const moves = reaches(grid, origin.node);

  return {
    id: 'rangeFormula',
    what: `Change the formula of the range at \`${origin.anchor}\``,
    moves,
    alone: false,
    intent: {
      kind: 'edit',
      file: found.file,
      patch: { ops: [{ op: 'set', path: [...found.path, 'formula'], value: typed.slice(1) }] },
      expects: {
        cells: new Set(moves.map((one) => qualified(one.sheet as SheetName, one.at))),
        beyond: 'refuse',
      },
    },
  };
}
