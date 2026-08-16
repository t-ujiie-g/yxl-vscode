import {
  type CompiledGrid,
  cellAt,
  type FacetOrigin,
  type FullAddr,
  reaches,
} from '@yxl-vscode/compile';
import { type A1Addr, qualified, type SheetName } from '@yxl-vscode/units';
import { type Intent, located, type Text } from './direct';

/**
 * One of the answers an edit has, where it has more than one.
 *
 * A cell whose value no single node of the spec wrote is not a cell that cannot
 * be edited — it is one where the editor must not pick (ADR-001). So each way
 * through is enumerated with what it would do and every cell it would move, and
 * the reader chooses. `overrides:` is the answer that is always available and is
 * offered separately, because it is the exception rather than a resolution
 * (ADR-007).
 */
export interface Candidate {
  readonly id: string;
  readonly what: string;
  readonly moves: readonly FullAddr[];
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
  const origin = cell?.provenance.value;
  if (origin === undefined || origin.kind !== 'formulaRange') return [];

  const written = rangeFormula(grid, origin, typed, text);
  return written === null ? [] : [written];
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
