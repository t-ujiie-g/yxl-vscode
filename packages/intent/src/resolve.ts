import {
  asCsvField,
  type CompiledFill,
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
import type { ScalarValue } from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  type CellRef,
  cellOf,
  type FilePath,
  moved,
  qualified,
  type Rect,
  type SheetName,
} from '@yxl-vscode/units';
import {
  beside,
  entryOp,
  type Found,
  holding,
  type Intent,
  located,
  type Reading,
  type Text,
} from './direct';
import { meaning } from './typed';

/**
 * One answer an edit has, with what it would do and every cell it would move,
 * for the reader to choose between (ADR-001). `alone` says it is the *whole*
 * answer, so a caller may take it without asking.
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
    const written = newCell(sheet, where, typed, spec.read);
    return written === null ? [] : [written];
  }

  const origin = cell.provenance.value;
  if (origin.kind === 'defRef') return definition(spec.grid, origin, where, typed, spec.read);
  if (origin.kind === 'param') return parameter(spec, origin, typed);
  if (origin.kind === 'external') return external(origin, where, typed, spec.read.text);
  if (origin.kind !== 'formulaRange') return [];

  return filledRange(spec.grid, sheet, origin, where, typed, spec.read);
}

/**
 * What resolving needs of the spec: the grid, the text, and the parameters the
 * reader has set in the preview — an answer invisible under those is no answer.
 */
export interface Resolving {
  readonly grid: CompiledGrid;
  readonly read: Reading;
  readonly params: ReadonlyMap<string, string>;
}

/**
 * The `param` row: change the default every cell reading it follows. Only where the
 * cell is one placeholder — `"${quarter} ${region}"` would have to be split in two.
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

  const found = located(declared, spec.read);
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
  read: Reading,
): readonly Candidate[] {
  const meant = meaning(typed);
  if (meant.is !== 'value') return [];

  const offered: Candidate[] = [];
  const def = located(origin.def, read);

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

  const holder = detachment(origin, meant.value, read);
  if (holder !== null) {
    offered.push({
      id: 'detach',
      what: `Write \`${where.at}\` as a value of its own, leaving the definition alone`,
      moves: [{ sheet: where.sheet, at: where.at }],
      alone: false,
      intent: {
        kind: 'edit',
        file: holder.file,
        patch: { ops: [holder.op] },
        expects: { cells: new Set([qualified(where.sheet, where.at)]), beyond: 'refuse' },
      },
    });
  }

  return offered;
}

/** One cell taken out of the sharing: the `$ref` written over with a value of its own; text, whose bytes put it back (ADR-026). */
export function detachment(
  origin: Extract<FacetOrigin, { kind: 'defRef' }>,
  value: ScalarValue,
  read: Reading,
): { file: FilePath; op: Op } | null {
  const holder = reference(located(origin.node, read));
  if (holder === null) return null;

  return { file: holder.file, op: { op: 'write', path: holder.path, source: renderScalar(value) } };
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
 * Whether a `data:` rectangle sits above or to the left, near enough that extending
 * it would reach this address — which is what makes the `empty` row's first a choice.
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

/** The `empty` row: a new `cells:` entry, at the end of the mapping. */
function newCell(
  sheet: CompiledSheet,
  where: { sheet: SheetName; at: A1Addr },
  typed: string,
  read: Reading,
): Candidate | null {
  if (typed === '') return null;

  const found = located(sheet.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const holds = found.node.entries.some((entry) => entry.key.value === 'cells');
  const op = entryOp(
    holds ? [...found.path, 'cells'] : found.path,
    holds,
    where.at,
    holding(typed),
  );

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
 * The `external` row: write the CSV field, and no other byte of the file. JSON is
 * not offered — putting a value back into one reformats the rest of it.
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

/** The `formulaRange` row: change the range's one formula, or split it so this cell holds its own. */
function filledRange(
  grid: CompiledGrid,
  sheet: CompiledSheet,
  origin: Extract<FacetOrigin, { kind: 'formulaRange' }>,
  where: { sheet: SheetName; at: A1Addr },
  typed: string,
  read: Reading,
): readonly Candidate[] {
  const meant = meaning(typed);
  if (meant.is !== 'formula') return [];

  const found = located(origin.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return [];
  if (!found.node.entries.some((entry) => entry.key.value === 'formula')) return [];

  const fill = sheet.fills.find((one) => one.node === origin.node);
  if (fill === undefined) return [];

  const offered: Candidate[] = [];
  const [cols, rows] = origin.offset;
  const anchored = moved(meant.body, { cols: -cols, rows: -rows });

  if (anchored.ok) offered.push(wholeRange(grid, origin, found, anchored.formula));

  const apart = split(fill, where, found, meant.body);
  if (apart !== null) offered.push(apart);

  return offered;
}

/** Change the range's own formula, which is what the typed one says at the anchor (ADR-031). */
function wholeRange(
  grid: CompiledGrid,
  origin: Extract<FacetOrigin, { kind: 'formulaRange' }>,
  found: Found & { kind: 'found' },
  formula: string,
): Candidate {
  const moves = reaches(grid, origin.node);
  const away = origin.offset[0] !== 0 || origin.offset[1] !== 0;
  const there = away ? `, which reads \`=${formula}\` there` : '';

  return {
    id: 'rangeFormula',
    what: `Change the formula of the range at \`${origin.anchor}\`${there}`,
    moves,
    alone: false,
    intent: {
      kind: 'edit',
      file: found.file,
      patch: { ops: [{ op: 'set', path: [...found.path, 'formula'], value: formula }] },
      expects: {
        cells: new Set(moves.map((one) => qualified(one.sheet as SheetName, one.at))),
        beyond: 'refuse',
      },
    },
  };
}

/** The range cut around this cell, every piece re-anchored; not at the anchor, where the formula is kept. */
function split(
  fill: CompiledFill,
  where: { sheet: SheetName; at: A1Addr },
  found: Found & { kind: 'found' },
  typed: string,
): Candidate | null {
  const index = found.path[found.path.length - 1];
  if (typeof index !== 'number' || fill.anchor === where.at) return null;

  // Rewritten are the two keys as written: a `${...}` in either would be
  // written over with whatever it resolved to.
  if (spelt(found.node, 'at') !== spanning(fill.rect)) return null;
  if (spelt(found.node, 'formula') !== fill.formula) return null;

  const cell = cellOf(where.at);
  const anchor = cellOf(fill.anchor);
  const pieces: { at: string; formula: string }[] = [];

  for (const rect of around(fill.rect, cell)) {
    const own = rect.top === cell.row && rect.left === cell.col;
    const done = own
      ? { ok: true as const, formula: typed }
      : moved(fill.formula, { cols: rect.left - anchor.col, rows: rect.top - anchor.row });
    if (!done.ok) return null;

    pieces.push({ at: spanning(rect), formula: done.formula });
  }

  const [first, ...rest] = pieces;
  if (first === undefined) return null;

  // Items added at one place are spliced from the end, so the last laid down reads first.
  const ops: Op[] = [
    { op: 'set', path: [...found.path, 'at'], value: first.at },
    ...rest.reverse().map(
      (piece): Op => ({
        op: 'insertSource',
        path: found.path.slice(0, -1),
        index: index + 1,
        source: `at: ${piece.at}\nformula: ${renderScalar(piece.formula, 'double')}`,
      }),
    ),
  ];

  return {
    id: 'splitRange',
    what: `Split the range at \`${fill.anchor}\` so \`${where.at}\` holds its own formula`,
    moves: [{ sheet: where.sheet, at: where.at }],
    alone: false,
    intent: {
      kind: 'edit',
      file: found.file,
      patch: { ops },
      expects: { cells: new Set([qualified(where.sheet, where.at)]), beyond: 'refuse' },
    },
  };
}

/** What a key of the entry says, where it says it plainly. */
function spelt(node: Node, key: string): string | null {
  if (node.kind !== 'map') return null;

  const held = node.entries.find((entry) => entry.key.value === key)?.value;
  return held?.kind === 'scalar' ? String(held.value) : null;
}

/** A rectangle as a range, however few cells it holds. */
function spanning(rect: Rect): string {
  return `${addrAt({ col: rect.left, row: rect.top })}:${addrAt({ col: rect.right, row: rect.bottom })}`;
}

/** The rectangle cut into the pieces a cell leaves of it, in reading order, the cell among them. */
function around(rect: Rect, cell: CellRef): readonly Rect[] {
  const pieces: Rect[] = [];

  if (cell.row > rect.top) pieces.push({ ...rect, bottom: cell.row - 1 });
  if (cell.col > rect.left)
    pieces.push({ top: cell.row, bottom: cell.row, left: rect.left, right: cell.col - 1 });
  pieces.push({ top: cell.row, bottom: cell.row, left: cell.col, right: cell.col });
  if (cell.col < rect.right)
    pieces.push({ top: cell.row, bottom: cell.row, left: cell.col + 1, right: rect.right });
  if (cell.row < rect.bottom) pieces.push({ ...rect, top: cell.row + 1 });

  return pieces;
}
