import {
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  type FacetOrigin,
  sheetOf,
} from '@yxl-vscode/compile';
import {
  type Node,
  nodeAt,
  type Op,
  type Parsed,
  type Path,
  parse,
  renderScalar,
  type Value,
} from '@yxl-vscode/cst';
import { pathOf } from '@yxl-vscode/loader';
import type { Patch } from '@yxl-vscode/patch';
import type { ScalarValue } from '@yxl-vscode/spec';
import {
  type A1Addr,
  type FilePath,
  type NodeId,
  qualified,
  type SheetName,
} from '@yxl-vscode/units';
import type { Expects } from '@yxl-vscode/verify';

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
  | { readonly kind: 'refused'; readonly why: string };

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
  if (sheet === null) return refused(`there is no sheet named \`${where.sheet}\``);

  const cell = cellAt(sheet, where.at);
  if (cell === null) return refused(`nothing writes \`${where.at}\` yet`);

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
  if (sheet === null) return refused(`there is no sheet named \`${where.sheet}\``);

  const cell = cellAt(sheet, where.at);
  if (cell === null) return refused(`nothing writes \`${where.at}\` yet`);
  if (cell.formula === null) return refused(`\`${where.at}\` holds no formula to change`);

  const written = literalPath(cell.provenance.value, sheet, where.at, read);
  if (written.kind === 'refused') return written;

  const at = written.node;
  if (at.kind !== 'map' || !at.entries.some((entry) => entry.key.value === 'formula')) {
    return refused(`\`${where.at}\` is written as a value, not as a formula`);
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
  | { kind: 'refused'; why: string };

/** Where a value is written, for the origins one node can be edited through. */
function valuePath(origin: FacetOrigin, sheet: CompiledSheet, at: A1Addr, read: Reading): Found {
  if (origin.kind === 'inline') {
    const block = located(origin.node, read);
    if (block.kind === 'refused') return block;

    return {
      ...block,
      path: [...block.path, 'values', origin.row, origin.col],
    };
  }

  const written = literalPath(origin, sheet, at, read);
  if (written.kind === 'refused') return written;

  if (written.node.kind !== 'map') return written;

  const holds = (key: string): boolean =>
    written.node.kind === 'map' && written.node.entries.some((entry) => entry.key.value === key);

  // A `value:` beside a `formula:` is Excel's cached result (`docs/spec.md` §3).
  if (holds('formula')) {
    return refused(`\`${at}\` holds a formula — type a formula to change it, starting with \`=\``);
  }

  if (holds('value')) return { ...written, path: [...written.path, 'value'] };

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
      return refused(
        `\`${at}\` reads a definition, which other cells read too — changing it here would change them as well`,
      );

    case 'param':
      return refused(`\`${at}\` reads the parameter \`${origin.params[0] ?? ''}\``);

    case 'external':
      return refused(`\`${at}\` reads row ${origin.row + 1} of \`${beside(origin.file)}\``);

    case 'formulaRange':
      return refused(
        origin.anchor === at
          ? `\`${at}\` is where this range's one formula is written, and changing it changes every cell the range fills`
          : `\`${at}\` is filled by the range anchored at \`${origin.anchor}\`, which writes one formula for every cell it covers — change it at \`${origin.anchor}\` to change them all`,
      );

    case 'inline':
      return located(origin.node, read);

    case 'empty':
      return origin.node === null
        ? refused(`nothing writes \`${at}\` yet`)
        : located(origin.node, read);

    default:
      return refused(`\`${at}\` on \`${sheet.name}\` holds nothing to change yet`);
  }
}

/** One `cells:` entry as it is written: a formula is a key under the address, a value its own scalar (`docs/spec.md` §3). */
export function entryText(at: A1Addr, holds: Holds): string {
  return 'formula' in holds
    ? `${at}:\n  formula: ${renderScalar(holds.formula, 'double')}`
    : `${at}: ${renderScalar(holds.value)}`;
}

/** The entry going in, with the `cells:` key itself where the sheet has none. */
export function entryOp(path: Path, cells: boolean, at: A1Addr, holds: Holds): Op {
  if (!cells) return { op: 'addSource', path, key: 'cells', source: entryText(at, holds) };

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
  if (where === null) return refused('this cell has no place in the file to edit');

  const tree = read.parsed(where.file);
  if (tree === null) return refused(`\`${where.file}\` could not be read`);

  const node = tree.root === null ? null : nodeAt(tree.root, where.path);
  if (node === null)
    return refused(`nothing is at \`${where.path.join('.')}\` in \`${where.file}\``);

  return { kind: 'found', file: where.file, path: where.path, node, add: false };
}

/**
 * One cell that stood in the way of a rectangle, and what stood there — the
 * construct, so that five hundred of them group into a sentence (§8 Q14).
 */
export interface Held {
  readonly at: A1Addr;
  readonly why: string;
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
export function standing(done: number, held: readonly Held[], doing: string): string {
  const total = done + held.length;
  const sole = held.length === 1 ? held[0] : undefined;
  const what = sole === undefined ? grouped(held) : sole.why;

  return `${held.length} of the ${total} cells here cannot be ${doing}, so none were: ${what}`;
}

/** What stood in the way of several, counted by kind: one cell's own reason does not scale to five hundred. */
function grouped(held: readonly Held[]): string {
  const kinds = [...new Set(held.map((one) => one.by))];

  return kinds
    .map((by) => {
      const many = held.filter((one) => one.by === by);
      return many.length === 1 ? `\`${many[0]?.at}\` ${THE[by]}` : `${many.length} ${THEY[by]}`;
    })
    .join(', ');
}

/** What one such cell is, and what several of them are; the same list, said singly and in a crowd. */
const THE: Record<Stood, string> = {
  range: 'is filled by a range',
  definition: 'reads a definition',
  parameter: 'reads a parameter',
  file: 'is read from a file beside the spec',
  data: 'is a field of a `data:` block',
  formula: 'holds a formula that cannot be moved here',
  rich: 'holds rich text',
  other: 'cannot be written',
};

const THEY: Record<Stood, string> = {
  range: 'are filled by a range',
  definition: 'read a definition',
  parameter: 'read a parameter',
  file: 'are read from a file beside the spec',
  data: 'are fields of a `data:` block',
  formula: 'hold formulas that cannot be moved here',
  rich: 'hold rich text',
  other: 'cannot be written',
};

/** A file as a reader would name it, which is not the whole way there. */
export function beside(file: string): string {
  return file.split('/').slice(-2).join('/');
}

function refused(why: string): Intent & { kind: 'refused' } {
  return { kind: 'refused', why };
}
