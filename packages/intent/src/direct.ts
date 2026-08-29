import {
  addressesIn,
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  type FacetOrigin,
  REACH,
  sheetOf,
} from '@yxl-vscode/compile';
import {
  entryOf,
  holds,
  type Node,
  nodeAt,
  type Op,
  type Parsed,
  type Path,
  parse,
  renderScalar,
  type Value,
} from '@yxl-vscode/cst';
import type { Message, Saying } from '@yxl-vscode/diag';
import { pathOf } from '@yxl-vscode/loader';
import type { Patch } from '@yxl-vscode/patch';
import {
  BAND_KEYS,
  INCLUDE_KEY,
  KEY,
  type ScalarValue,
  type Sheet,
  type SpecDoc,
} from '@yxl-vscode/spec';
import {
  type A1Addr,
  type FilePath,
  type NodeId,
  names,
  qualified,
  type SheetName,
} from '@yxl-vscode/units';
import type { Expects } from '@yxl-vscode/verify';
import { type HeldKey, say } from './text';
import { meaning } from './typed';

/** What a write needs of the spec: the tree it edits, and what that tree draws. */
export interface Projection {
  readonly doc: SpecDoc;
  readonly grid: CompiledGrid;
}

/**
 * What a gesture came to: an edit to make, with what it claims to change, or a
 * refusal in words a reader can act on (ADR-001). `edit` is a patch over a
 * spec; `wrote` is a companion file, which has no patch algebra, as it should be.
 */
export type Intent =
  | {
      readonly kind: 'edit';
      readonly file: FilePath;
      readonly patch: Patch;
      readonly expects: Expects;
    }
  | {
      readonly kind: 'wrote';
      readonly file: FilePath;
      readonly text: string;
      readonly expects: Expects;
    }
  | { readonly kind: 'refused'; readonly why: Saying };

/** The text of a file the spec was read from, as it stands. */
export type Text = (file: FilePath) => string | null;

/** What a cell holds: one or the other, never both (`docs/spec.md` §3). */
export type Holds = { readonly formula: string } | { readonly value: ScalarValue };

/**
 * The files an edit reads: their text, and the tree parsed from it — which is
 * worked out once per file however many cells of a rectangle ask for it.
 */
export interface Reading {
  readonly text: Text;
  readonly parsed: (file: FilePath) => Parsed | null;
}

/** A reading of the files as they stand, which parses one the first time something asks for its tree. */
export function reading(text: Text): Reading {
  const trees = new Map<FilePath, Parsed | null>();

  return {
    text,
    parsed: (file) => {
      const already = trees.get(file);
      if (already !== undefined) return already;

      const source = text(file);
      const tree = source === null ? null : parse(source, { file });
      trees.set(file, tree);
      return tree;
    },
  };
}

/**
 * Typing a value into a cell one node of the spec answers for. Everything else
 * has more than one answer or none, and is a refusal with a reason (ADR-006).
 */
export function setValue(
  grid: CompiledGrid,
  where: { sheet: SheetName; at: A1Addr },
  value: string | number | boolean | null,
  read: Reading,
): Intent {
  const sheet = sheetOf(grid, where.sheet);
  if (sheet === null) return refused(say('intent.no-such-sheet', { sheet: where.sheet }));

  const cell = cellAt(sheet, where.at);
  if (cell === null) return refused(nothingWrites(sheet, where.at, read));

  const found = valuePath(cell.provenance.value, sheet, where.at, read);
  if (found.kind === 'refused') return found;

  return {
    kind: 'edit',
    file: found.file,
    patch: { ops: [written(found, value)] },
    expects: { cells: new Set([qualified(where.sheet, where.at)]), beyond: 'ask' },
  };
}

/** The op that puts the value in; a new `value:` key goes first, as the spec's examples write it. */
function written(found: Found & { kind: 'found' }, value: Value): Op {
  if (!found.add) return { op: 'set', path: found.path, value };

  const first = found.node.kind === 'map' ? found.node.entries[0] : undefined;

  return {
    op: 'add',
    path: found.path,
    key: 'value',
    value,
    before: first === undefined ? null : String(first.key.value),
  };
}

/** Typing a formula into a cell that already holds one; giving a value cell a formula is a change of shape. */
export function setFormula(
  grid: CompiledGrid,
  where: { sheet: SheetName; at: A1Addr },
  formula: string,
  read: Reading,
): Intent {
  const sheet = sheetOf(grid, where.sheet);
  if (sheet === null) return refused(say('intent.no-such-sheet', { sheet: where.sheet }));

  const cell = cellAt(sheet, where.at);
  if (cell === null) return refused(say('intent.nothing-writes-yet', { at: where.at }));
  if (cell.formula === null) return refused(say('intent.no-formula-to-change', { at: where.at }));

  const written = literalPath(cell.provenance.value, sheet, where.at, read);
  if (written.kind === 'refused') return written;

  const at = written.node;
  if (at.kind !== 'map' || !holds(at, 'formula')) {
    return refused(say('intent.written-as-a-value', { at: where.at }));
  }

  return {
    kind: 'edit',
    file: written.file,
    patch: { ops: [{ op: 'set', path: [...written.path, 'formula'], value: formula }] },
    expects: { cells: new Set([qualified(sheet.name, where.at)]), beyond: 'ask' },
  };
}

/**
 * Where an edit would be written, or why not. `add` is a `value:` key the cell
 * has not got — `B4: { format: "0.0%" }` is a cell (`docs/spec.md` §3).
 */
export type Found =
  | { kind: 'found'; file: FilePath; path: Path; node: Node; add: boolean }
  | { kind: 'refused'; why: Saying };

/** Where a value is written, for the origins one node can be edited through. */
function valuePath(origin: FacetOrigin, sheet: CompiledSheet, at: A1Addr, read: Reading): Found {
  if (origin.kind === 'inline') {
    const block = located(origin.node, read);
    if (block.kind === 'refused') return block;

    return {
      ...block,
      path: [...block.path, KEY.values, origin.row, origin.col],
    };
  }

  const written = literalPath(origin, sheet, at, read);
  if (written.kind === 'refused') return written;

  if (written.node.kind !== 'map') return written;

  // A `value:` beside a `formula:` is Excel's cached result (`docs/spec.md` §3).
  if (holds(written.node, 'formula')) {
    return refused(say('intent.holds-a-formula', { at }));
  }

  // A cell cannot be `rich` and hold a value too (`docs/spec.md` §3).
  if (holds(written.node, KEY.rich)) {
    return refused(say('intent.holds-rich-text', { at }));
  }

  if (holds(written.node, 'value')) return { ...written, path: [...written.path, 'value'] };

  return { ...written, add: true };
}

/** The node that wrote a cell, where one node did. */
export function literalPath(
  origin: FacetOrigin,
  sheet: CompiledSheet,
  at: A1Addr,
  read: Reading,
): Found {
  switch (origin.kind) {
    case 'literal':
    case 'override':
      return located(origin.node, read);

    case 'defRef':
      return refused(say('intent.reads-a-definition', { at }));

    case 'param':
      return refused(say('intent.reads-a-parameter', { at, name: origin.params[0] ?? '' }));

    case 'external':
      return refused(
        say('intent.reads-a-row', { at, row: origin.row + 1, file: beside(origin.file) }),
      );

    case 'formulaRange':
      return refused(
        origin.anchor === at
          ? say('intent.is-the-anchor', { at })
          : say('intent.is-filled-by', { at, anchor: origin.anchor }),
      );

    case 'inline':
      return located(origin.node, read);

    case 'empty':
      return origin.node === null
        ? refused(say('intent.nothing-writes-yet', { at }))
        : located(origin.node, read);

    default:
      return refused(say('intent.nothing-to-change-yet', { at, sheet: sheet.name }));
  }
}

/** What a typed string would have a cell hold; a formula that is not one is taken as nothing. */
export function holding(typed: string): Holds {
  const meant = meaning(typed);
  if (meant.is === 'formula') return { formula: meant.body };

  return { value: meant.is === 'value' ? meant.value : null };
}

/** One `cells:` entry as it is written: a formula is a key under the address, a value its own scalar (`docs/spec.md` §3). */
export function entryText(at: A1Addr, holds: Holds): string {
  return 'formula' in holds
    ? `${at}:\n  formula: ${renderScalar(holds.formula, 'double')}`
    : `${at}: ${renderScalar(holds.value)}`;
}

/** The entry going in, with the `cells:` key itself where the sheet has none. */
export function entryOp(path: Path, cells: boolean, at: A1Addr, holds: Holds): Op {
  if (!cells) return { op: 'addSource', path, key: KEY.cells, source: entryText(at, holds) };

  return 'formula' in holds
    ? {
        op: 'addSource',
        path,
        key: at,
        source: `formula: ${renderScalar(holds.formula, 'double')}`,
      }
    : { op: 'add', path, key: at, value: holds.value, before: null };
}

/** The node an id names, read out of the file it lives in. */
export function located(id: NodeId, read: Reading): Found {
  const where = pathOf(id);
  if (where === null) return refused(say('intent.no-place-in-the-file'));

  const tree = read.parsed(where.file);
  if (tree === null) return refused(say('intent.file-unreadable', { file: where.file }));

  const node = tree.root === null ? null : nodeAt(tree.root, where.path);
  if (node === null)
    return refused(say('intent.nothing-at-path', { path: where.path.join('.'), file: where.file }));

  return { kind: 'found', file: where.file, path: where.path, node, add: false };
}

/** Why an address holds nothing to write: the sheet keeps its cells elsewhere, or nothing writes it yet. */
function nothingWrites(sheet: CompiledSheet, at: A1Addr, read: Reading): Saying {
  const found = located(sheet.node, read);
  const away = found.kind === 'found' ? keptElsewhere(found.node, KEY.cells, sheet.name) : null;

  return away ?? say('intent.nothing-writes-yet', { at });
}

/**
 * Why a key of this sheet cannot be written here, or `null` where it can: an
 * `$include` stands for the whole node it replaces, so what belongs under the
 * key is another file's to edit (`docs/spec.md` §8).
 */
export function keptElsewhere(node: Node, key: string, sheet: SheetName): Message | null {
  const written = entryOf(node, key)?.value ?? null;
  if (written === null || !holds(written, INCLUDE_KEY)) return null;

  return say('intent.kept-in-another-file', { sheet, what: HELD[key] ?? key });
}

/** Which of a sheet's keys a refusal names, since the sentence has its own word for each. */
const HELD: Record<string, HeldKey> = {
  [KEY.cells]: 'cells',
  [KEY.comments]: 'comments',
  [KEY.links]: 'links',
  [KEY.validations]: 'validations',
  [KEY.tables]: 'tables',
  [KEY.charts]: 'charts',
  [KEY.images]: 'images',
  [KEY.data]: 'data',
  [KEY.formulas]: 'formulas',
  [KEY.merges]: 'merges',
  [BAND_KEYS.column.at]: 'columns',
  [BAND_KEYS.row.at]: 'rows',
};

/** The sheet's own mapping in the file, with the compiled sheet it projects to. */
export type WrittenSheet =
  | {
      kind: 'found';
      file: FilePath;
      path: Path;
      node: Node;
      add: boolean;
      sheet: CompiledSheet;
    }
  | { kind: 'refused'; why: Saying };

/**
 * Where a sheet is written, which is where every key a gesture puts under a
 * sheet goes. A sheet not in the grid, not in the file, or not written as a
 * mapping is refused here rather than at each gesture.
 */
export function writtenSheet(spec: Projection, name: SheetName, read: Reading): WrittenSheet {
  const sheet = sheetOf(spec.grid, name);
  if (sheet === null) return refused(say('intent.no-such-sheet', { sheet: name }));

  const found = located(sheet.node, read);
  if (found.kind === 'refused') return found;
  if (found.node.kind !== 'map')
    return refused(say('intent.not-written-as-a-sheet', { sheet: name }));

  return { ...found, sheet };
}

/**
 * One cell that stood in the way of a rectangle, and what stood there — the
 * construct, so that five hundred of them group into a sentence (§8 Q14).
 */
export interface Held {
  readonly at: A1Addr;
  readonly why: Saying;
  readonly by: Stood;
}

/** What can stand between a cell and an edit, as a rectangle counts them up. */
export type Stood =
  | 'range'
  | 'definition'
  | 'parameter'
  | 'file'
  | 'data'
  | 'formula'
  | 'rich'
  | 'other';

/** What a cell's origin means to a rectangle that cannot write it. */
export function stood(origin: FacetOrigin): Stood {
  switch (origin.kind) {
    case 'formulaRange':
      return 'range';
    case 'defRef':
      return 'definition';
    case 'param':
      return 'parameter';
    case 'external':
      return 'file';
    case 'inline':
      return 'data';
    default:
      return 'other';
  }
}

/**
 * Why a rectangle was not done: how many of how many, and what stood in the way
 * grouped and counted. `doing` is the verb in the past — `emptied`, `pasted`.
 */
export function standing(done: number, held: readonly Held[], doing: string): Message {
  const sole = held.length === 1 ? held[0] : undefined;
  if (sole !== undefined) {
    return say('intent.one-cannot', { total: done + 1, why: sole.why, doing });
  }

  return say('intent.some-cannot', {
    done,
    held: held.map((one) => ({ at: String(one.at), by: one.by })),
    doing,
  });
}

/** What an answer that excepts one group of a rectangle would do, in the same words the refusal counted them in. */
export function excepting(by: Stood, many: number): Message {
  return say('intent.write-as-override', { by, many });
}

/** A file as a reader would name it, which is not the whole way there. */
export function beside(file: string): string {
  return file.split('/').slice(-2).join('/');
}

/** An edit that will not happen, and the sentence a reader can act on (ADR-001). */
export function refused(why: Saying): Intent & { kind: 'refused' } {
  return { kind: 'refused', why };
}

/**
 * Every cell on the other sheets whose formula names this one, as `Sheet!A1`.
 * A rename rewrites them; a deletion is refused over them rather than leaving
 * `#REF!` behind.
 */
export function cellsNaming(spec: Projection, sheet: SheetName): Set<string> {
  const found = new Set<string>();

  for (const one of spec.grid.sheets) {
    if (one.name === sheet) continue;

    for (const at of addressesIn(one, REACH)) {
      const body = cellAt(one, at)?.formula ?? null;
      if (body !== null && names(body, sheet)) found.add(qualified(one.name, at));
    }
  }

  return found;
}

/** The name a sheet is written under, or `null` where a `${...}` stands in its place. */
export function nameOf(sheet: Sheet): SheetName | null {
  return typeof sheet.name === 'string' ? sheet.name : null;
}

/**
 * The ops that put a value under a key of a node, or take the key out where the
 * value is `null` — nothing where there is nothing to do (`docs/spec.md` §2).
 */
export function keyed(path: Path, key: string, value: Value | null, node: Node): Op[] {
  const already = holds(node, key);
  if (value === null) return already ? [{ op: 'remove', path: [...path, key] }] : [];
  if (already) return [{ op: 'set', path: [...path, key], value }];

  return [{ op: 'add', path, key, value, before: null }];
}
