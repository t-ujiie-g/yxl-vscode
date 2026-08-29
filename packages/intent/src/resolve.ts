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
import { entryOf, holds, type Node, type Op, type Path, renderScalar } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import { KEY, REF_KEY, type ScalarValue } from '@yxl-vscode/spec';
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
  keptElsewhere,
  located,
  type Reading,
  type Text,
} from './direct';
import { blocks } from './shift';
import { say } from './text';
import { meaning } from './typed';

/**
 * One answer an edit has, with what it would do and every cell it would move,
 * for the reader to choose between (ADR-001). `alone` says it is the *whole*
 * answer, so a caller may take it without asking.
 */
export interface Candidate {
  readonly id: string;
  readonly what: Saying;
  readonly moves: readonly FullAddr[];
  readonly alone: boolean;
  readonly intent: Intent;
  readonly keys?: number;
}

/** Every way of making an edit the direct path refused — the resolution table, a row per origin. */
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
    const onto = ontoBlock(sheet, where, typed, spec.read);

    return [written, onto].filter((one) => one !== null);
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

/** The `param` row: only where the cell is one placeholder, since two would have to be split. */
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
      what: say('intent.change-the-parameter', { name }),
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
      what: say('intent.change-the-definition', { name: String(def.path[def.path.length - 1]) }),
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
      what: say('intent.write-as-its-own-value', { at: where.at }),
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

  if (holds(found.node, REF_KEY)) return { file: found.file, path: found.path };

  const held = entryOf(found.node, 'value');
  return held !== undefined && holds(held.value, REF_KEY)
    ? { file: found.file, path: [...found.path, 'value'] }
    : null;
}

/** Whether a `data:` rectangle sits above or to the left, near enough that extending it would reach this address. */
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

/** The `empty` row's second answer: the row goes into the `data:` block above it (§8 Q1). */
function ontoBlock(
  sheet: CompiledSheet,
  where: { sheet: SheetName; at: A1Addr },
  typed: string,
  read: Reading,
): Candidate | null {
  const holds = holding(typed);
  if (typed === '' || 'formula' in holds) return null;

  const cell = cellOf(where.at);
  const block = blocks(sheet).find(
    (one) =>
      one.file === null &&
      one.rect.bottom === cell.row - 1 &&
      one.rect.left <= cell.col &&
      cell.col <= one.rect.right,
  );
  if (block === undefined) return null;

  const found = located(block.node, read);
  if (found.kind === 'refused') return null;

  const fields = Array.from({ length: cell.col - block.rect.left }, () => 'null');
  const anchor = addrAt({ col: block.rect.left, row: block.rect.top });
  const rows = block.rect.bottom - block.rect.top + 1;

  return {
    id: 'ontoBlock',
    what: say('intent.add-a-table-row', { anchor }),
    moves: [{ sheet: where.sheet, at: where.at }],
    alone: false,
    intent: {
      kind: 'edit',
      file: found.file,
      patch: {
        ops: [
          {
            op: 'insertSource',
            path: [...found.path, KEY.values],
            index: rows,
            source: `[${[...fields, renderScalar(holds.value)].join(', ')}]`,
          },
        ],
      },
      expects: { cells: new Set([qualified(where.sheet, where.at)]), beyond: 'refuse' },
    },
  };
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
  if (keptElsewhere(found.node, KEY.cells, where.sheet) !== null) return null;

  const written = holds(found.node, KEY.cells);
  const op = entryOp(
    written ? [...found.path, KEY.cells] : found.path,
    written,
    where.at,
    holding(typed),
  );

  return {
    id: 'newCell',
    what: say('intent.write-as-a-new-cell', { at: where.at }),
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

/** The `external` row: the CSV field and no other byte. JSON is not offered — writing one reformats it. */
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
      what: say('intent.write-into-the-file', { file: beside(origin.file) }),
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
  if (!holds(found.node, 'formula')) return [];

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

  return {
    id: 'rangeFormula',
    what: say('intent.change-the-range-formula', {
      anchor: origin.anchor,
      formula: away ? formula : '',
    }),
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
  if (spelt(found.node, KEY.at) !== spanning(fill.rect)) return null;
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
    { op: 'set', path: [...found.path, KEY.at], value: first.at },
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
    what: say('intent.split-the-range', { anchor: fill.anchor, at: where.at }),
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

  const held = entryOf(node, key)?.value;
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
