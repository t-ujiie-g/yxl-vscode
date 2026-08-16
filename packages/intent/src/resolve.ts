import {
  asCsvField,
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  type FacetOrigin,
  type FullAddr,
  fieldAt,
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
import { beside, type Found, type Intent, located, type Text } from './direct';
import { meaning } from './typed';

/**
 * One answer an edit has, with what it would do and every cell it would move,
 * for the reader to choose between (ADR-001). `alone` says it is the *whole*
 * answer, so a caller may take it without asking. `overrides:` is offered
 * beside the list, not in it (ADR-007).
 */
export interface Candidate {
  readonly id: string;
  readonly what: string;
  readonly moves: readonly FullAddr[];
  readonly alone: boolean;
  readonly intent: Intent;
}

/** Every way of making an edit the direct path refused — `ROADMAP.md` §4.4, a row per origin. */
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
  if (origin.kind === 'external') return external(origin, where, typed, spec.text);
  if (origin.kind !== 'formulaRange') return [];

  const written = rangeFormula(spec.grid, origin, typed, spec.text);
  return written === null ? [] : [written];
}

/**
 * What resolving needs of the spec: the grid, the text, and the parameters the
 * reader has set in the preview — an answer invisible under those is no answer.
 */
export interface Resolving {
  readonly grid: CompiledGrid;
  readonly text: Text;
  readonly params: ReadonlyMap<string, string>;
}

/**
 * The `param` row: change the default every cell reading it follows. Only where
 * the cell is exactly one placeholder — `"${quarter} ${region}"` typed over
 * would have to be split back across two, and which half went where is a guess.
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

  // Set in the preview: changing the default would leave the grid as it is.
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

/** The `defRef` row: change the definition every cell shares, or take this one cell out of the sharing. */
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
        // Written over is a mapping, so text, whose bytes put it back (ADR-026).
        patch: { ops: [{ op: 'write', path: holder.path, source: renderScalar(meant.value) }] },
        expects: { cells: new Set([qualified(where.sheet, where.at)]), beyond: 'refuse' },
      },
    });
  }

  return offered;
}

/** The node holding the `$ref`: the cell itself, or its `value:` where the cell says more. */
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
 * Whether a `data:` rectangle sits above or to the left, where extending it
 * would reach this address — the `empty` row's second answer, which makes the
 * first a choice.
 */
function nextToData(sheet: CompiledSheet, at: A1Addr): boolean {
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
 * The entry going in: a formula is a key under the address, a value its own
 * scalar (`docs/spec.md` §3), and where the sheet has no `cells:` the key goes
 * in too.
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

/** The `empty` row: a new `cells:` entry, at the end of the mapping. */
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
    alone: !nextToData(sheet, where.at),
    intent: {
      kind: 'edit',
      file: found.file,
      patch: { ops: [op] },
      expects: { cells: new Set([qualified(where.sheet, where.at)]), beyond: 'refuse' },
    },
  };
}

/**
 * The `external` row: write the CSV field, and no other byte of the file. JSON
 * is not offered — a value cannot yet be put back into one without reformatting
 * the rest, and reformatting somebody's data file is not a trade this makes.
 */
function external(
  origin: Extract<FacetOrigin, { kind: 'external' }>,
  where: { sheet: SheetName; at: A1Addr },
  typed: string,
  text: Text,
): readonly Candidate[] {
  const meant = meaning(typed);
  if (meant.is === 'formula') return [];
  if (!origin.file.endsWith('.csv')) return [];

  const source = text(origin.file);
  if (source === null) return [];

  const at = fieldAt(source, origin.row, origin.col);
  if (at === null) return [];

  const written = asCsvField(meant.is === 'value' ? meant.value : null);

  return [
    {
      id: 'dataFile',
      what: `Write it into \`${beside(origin.file)}\`, where the value comes from`,
      moves: [{ sheet: where.sheet, at: where.at }],
      alone: false,
      intent: {
        kind: 'wrote',
        file: origin.file,
        text: source.slice(0, at.start) + written + source.slice(at.end),
        expects: { cells: new Set([qualified(where.sheet, where.at)]), beyond: 'ask' },
      },
    },
  ];
}

/**
 * The `formulaRange` row: change the range's formula, at its anchor only.
 * `=B3*0.1` typed one row down means `B2*0.1` to the range, and shifting it
 * back is reference translation (`ROADMAP.md` §8 Q2).
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
