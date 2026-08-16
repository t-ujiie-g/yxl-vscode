import {
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  type FacetOrigin,
  type FullAddr,
  reaches,
  sheetOf,
} from '@yxl-vscode/compile';
import { type Node, type Op, type Path, renderScalar } from '@yxl-vscode/cst';
import {
  type A1Addr,
  addrAt,
  cellOf,
  type FilePath,
  qualified,
  type SheetName,
} from '@yxl-vscode/units';
import { type Found, type Intent, located, type Text } from './direct';
import { meaning } from './typed';

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
  spec: Resolving,
  where: { sheet: SheetName; at: A1Addr },
  typed: string,
): readonly Candidate[] {
  const sheet = sheetOf(spec.grid, where.sheet);
  if (sheet === null) return [];

  const cell = cellAt(sheet, where.at);
  if (cell === null) {
    const written = newCell(sheet, where, typed, spec.text);
    return written === null ? [] : [written];
  }

  const origin = cell.provenance.value;
  if (origin.kind === 'defRef') return definition(spec.grid, origin, where, typed, spec.text);
  if (origin.kind === 'param') return parameter(spec, origin, typed);
  if (origin.kind !== 'formulaRange') return [];

  const written = rangeFormula(spec.grid, origin, typed, spec.text);
  return written === null ? [] : [written];
}

/**
 * What resolving an edit needs of the spec: what it draws, what it is written
 * as, and what the reader is *looking* at it as.
 *
 * The last one matters because a parameter set in the preview changes what the
 * grid shows without changing a byte (ADR-001), and an answer that would be
 * invisible under that setting is not an answer.
 */
export interface Resolving {
  readonly grid: CompiledGrid;
  readonly text: Text;
  readonly params: ReadonlyMap<string, string>;
}

/**
 * A cell whose value comes from a parameter's default (`docs/spec.md` §7).
 *
 * One answer: change the default, which every cell reading that parameter
 * follows. `overrides:` is the other, and is offered beside this list rather
 * than in it (§4.4).
 *
 * Offered only where the cell is **exactly one placeholder**. `"${quarter}
 * ${region}"` typed over with `Q4 EMEA` would have to be split back across two
 * parameters, and which half went where is precisely what this editor does not
 * guess (ADR-001).
 */
function parameter(
  spec: Resolving,
  origin: Extract<FacetOrigin, { kind: 'param' }>,
  typed: string,
): readonly Candidate[] {
  const meant = meaning(typed);
  const name = origin.params[0];
  const declared = origin.declared[0];
  if (meant.is !== 'value' || name === undefined || declared === undefined) return [];
  if (origin.template.trim() !== `\${${name}}` || origin.params.length !== 1) return [];

  // Set in the preview, so the default is not what the reader is looking at:
  // changing it would leave the grid exactly as it is (§4.4's `param` row).
  if (spec.params.has(name)) return [];

  const found = located(declared, spec.text);
  if (found.kind === 'refused' || found.node.kind !== 'scalar') return [];

  const moves = reaches(spec.grid, declared);

  return [
    {
      id: 'parameter',
      what: `Change the parameter \`${name}\`, which every cell reading it follows`,
      moves,
      alone: false,
      intent: {
        kind: 'edit',
        file: found.file,
        patch: { ops: [{ op: 'set', path: found.path, value: meant.value }] },
        expects: {
          cells: new Set(moves.map((one) => qualified(one.sheet as SheetName, one.at))),
          beyond: 'ask',
        },
      },
    },
  ];
}

/**
 * A cell that reads a `defs.values` entry (`docs/spec.md` §6), and the two
 * answers typing into one has.
 *
 * They are the shape of the whole phase: change the thing many cells share, or
 * take this one cell out of the sharing. Neither is the obvious answer — which
 * is why a definition is `mediated` and always asks — and the difference
 * between them is the count beside each.
 */
function definition(
  grid: CompiledGrid,
  origin: Extract<FacetOrigin, { kind: 'defRef' }>,
  where: { sheet: SheetName; at: A1Addr },
  typed: string,
  text: Text,
): readonly Candidate[] {
  const meant = meaning(typed);
  if (meant.is !== 'value') return [];

  const offered: Candidate[] = [];
  const def = located(origin.def, text);

  if (def.kind === 'found' && def.node.kind === 'scalar') {
    const moves = reaches(grid, origin.def);
    offered.push({
      id: 'definition',
      what: `Change \`${String(def.path[def.path.length - 1])}\`, which every cell reading it follows`,
      moves,
      alone: false,
      intent: {
        kind: 'edit',
        file: def.file,
        patch: { ops: [{ op: 'set', path: def.path, value: meant.value }] },
        expects: {
          cells: new Set(moves.map((one) => qualified(one.sheet as SheetName, one.at))),
          beyond: 'refuse',
        },
      },
    });
  }

  const holder = reference(located(origin.node, text));
  if (holder !== null) {
    offered.push({
      id: 'detach',
      what: `Write \`${where.at}\` as a value of its own, leaving the definition alone`,
      moves: [{ sheet: where.sheet, at: where.at }],
      alone: false,
      intent: {
        kind: 'edit',
        file: holder.file,
        // Text rather than a value: what is written over is a mapping, and the
        // bytes it was are what puts it back (ADR-026).
        patch: { ops: [{ op: 'write', path: holder.path, source: renderScalar(meant.value) }] },
        expects: { cells: new Set([qualified(where.sheet, where.at)]), beyond: 'refuse' },
      },
    });
  }

  return offered;
}

/**
 * The node that holds the `$ref`, which is the cell itself where the spec wrote
 * `A1: { $ref: name }` and its `value:` where the cell says more than that.
 */
function reference(found: Found): { file: FilePath; path: Path } | null {
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const refs = (node: Node): boolean =>
    node.kind === 'map' && node.entries.some((entry) => entry.key.value === '$ref');

  if (refs(found.node)) return { file: found.file, path: found.path };

  const held = found.node.entries.find((entry) => entry.key.value === 'value');
  return held !== undefined && refs(held.value)
    ? { file: found.file, path: [...found.path, 'value'] }
    : null;
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
  const meant = meaning(typed);
  const formula = meant.is === 'formula' ? `formula: ${renderScalar(meant.body, 'double')}` : null;

  if (!holds) {
    const source =
      formula === null
        ? `${at}: ${renderScalar(meant.is === 'value' ? meant.value : null)}`
        : `${at}:\n  ${formula}`;
    return { op: 'addSource', path, key: 'cells', source };
  }

  return formula === null
    ? { op: 'add', path, key: at, value: meant.is === 'value' ? meant.value : null, before: null }
    : { op: 'addSource', path, key: at, source: formula };
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
  if (meaning(typed).is !== 'formula') return null;
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
