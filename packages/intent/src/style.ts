import {
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  type FacetOrigin,
  reaches,
  resolve,
  type StyleLayer,
  sheetOf,
  styleAt,
} from '@yxl-vscode/compile';
import type { Node, Op, Path } from '@yxl-vscode/cst';
import { normalize, written } from '@yxl-vscode/normalize';
import { STYLE_PROPERTIES, type StyleProperty, type StyleValues } from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  type FilePath,
  type NodeId,
  qualified,
  type Rect,
  type SheetName,
} from '@yxl-vscode/units';
import { type Found, located, type Reading } from './direct';
import type { Candidate } from './resolve';

/** What a style write needs of the spec: what it draws, which carries the looks it declares. */
export interface Styling {
  readonly grid: CompiledGrid;
}

/**
 * Every way of making a rectangle look as the reader asked — `ROADMAP.md` §4.4's
 * `setStyle` table. Where one answer is the whole answer it says so, and the
 * caller may take it without asking (ADR-001).
 */
export function setStyle(
  spec: Styling,
  where: { sheet: SheetName; rect: Rect },
  want: StyleValues,
  read: Reading,
): readonly Candidate[] {
  const sheet = sheetOf(spec.grid, where.sheet);
  const wanted = properties(want);
  if (sheet === null || wanted.length === 0) return [];

  const addresses = spread(where.rect);
  const supplier = supplying(sheet, addresses, wanted);
  if (supplier === 'mixed') return [];

  const answers: Candidate[] = [];
  if (supplier === null || !excepted(supplier)) {
    const own = onCells(spec, sheet, where, addresses, want, read);
    if (own !== null) answers.push(own);
  }

  const shared = elsewhere(spec, supplier, want, read);
  if (shared !== null) answers.unshift(shared);

  return answers.length === 1 ? [{ ...answers[0], alone: true } as Candidate] : answers;
}

/** The layer every cell takes these from: `null` where none does, `mixed` where they disagree (ADR-001). */
function supplying(
  sheet: CompiledSheet,
  addresses: readonly A1Addr[],
  wanted: readonly StyleProperty[],
): StyleLayer | null | 'mixed' {
  const seen = new Set<string>();
  let found: StyleLayer | null = null;

  for (const at of addresses) {
    const layers = styleAt(sheet, at);
    for (const key of wanted) {
      const layer = layers.findLast((one) => one.gives[key] !== undefined) ?? null;
      seen.add(layer === null ? '' : layer.node);
      found = layer ?? found;
    }
  }

  if (seen.size > 1) return 'mixed';
  return seen.has('') ? null : found;
}

/** The answer that writes it on the cells themselves, over what each already contributes (ADR-008, ADR-037). */
function onCells(
  spec: Styling,
  sheet: CompiledSheet,
  where: { sheet: SheetName; rect: Rect },
  addresses: readonly A1Addr[],
  want: StyleValues,
  read: Reading,
): Candidate | null {
  const ops = new Map<FilePath, Op[]>();

  for (const at of addresses) {
    const one = onCell(spec, sheet, at, want, read);
    if (one === null) return null;

    ops.set(one.file, [...(ops.get(one.file) ?? []), ...one.ops]);
  }

  const files = [...ops.keys()];
  const file = files[0];
  if (file === undefined || files.length > 1) return null;

  const moves = addresses.map((at) => ({ sheet: where.sheet, at }));

  return {
    id: 'onCells',
    what: `Write it on ${said(addresses)}`,
    moves,
    alone: false,
    intent: {
      kind: 'edit',
      file,
      patch: { ops: ops.get(file) ?? [] },
      expects: { cells: new Set(moves.map((one) => qualified(one.sheet, one.at))), beyond: 'ask' },
    },
  };
}

/** One cell's own `style:`, rewritten as what it contributes now plus what was asked for. */
function onCell(
  spec: Styling,
  sheet: CompiledSheet,
  at: A1Addr,
  want: StyleValues,
  read: Reading,
): { file: FilePath; ops: readonly Op[] } | null {
  const own = styleAt(sheet, at).filter((one) => one.through === 'cell' && one.key === 'style');
  const gives = { ...resolve(own), ...want };
  const how = normalize(gives, spec.grid.styles);
  if (how === null) return null;

  const source = written(how);
  const cell = cellAt(sheet, at);
  const node = cell === null ? null : nodeOf(cell.provenance.value);
  if (node === null) return newCell(sheet, at, source, read);

  const found = located(node, read);
  if (found.kind === 'refused') return null;

  // `A1: 1` has nowhere to put a look; it becomes the cell the long way round.
  if (found.node.kind === 'scalar') {
    const written = `{ value: ${found.node.source}, ${STYLE}: ${source} }`;
    return { file: found.file, ops: [{ op: 'write', path: found.path, source: written }] };
  }
  if (found.node.kind !== 'map') return null;

  const holds = found.node.entries.some((entry) => entry.key.value === STYLE);
  return {
    file: found.file,
    ops: [
      holds
        ? { op: 'write', path: [...found.path, STYLE], source }
        : { op: 'addSource', path: found.path, key: STYLE, source },
    ],
  };
}

/** A look on an address nothing writes: a cell that carries styling and no value (`docs/spec.md` §3). */
function newCell(
  sheet: CompiledSheet,
  at: A1Addr,
  source: string,
  read: Reading,
): { file: FilePath; ops: readonly Op[] } | null {
  const found = located(sheet.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const holds = found.node.entries.some((entry) => entry.key.value === CELLS);
  const entry = `${STYLE}: ${source}`;

  return {
    file: found.file,
    ops: [
      holds
        ? { op: 'addSource', path: [...found.path, CELLS], key: at, source: entry }
        : { op: 'addSource', path: found.path, key: CELLS, source: `${at}:\n  ${entry}` },
    ],
  };
}

/** The answer that changes what the look comes from: a declaration, a band, or the override over it. */
function elsewhere(
  spec: Styling,
  supplier: StyleLayer | null,
  want: StyleValues,
  read: Reading,
): Candidate | null {
  if (supplier === null) return null;

  const found = located(supplier.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const into = supplier.name === null && supplier.through !== 'cell' ? STYLE : null;
  const ops = writing(found, into, want);
  if (ops === null) return null;

  const moves = reaches(spec.grid, supplier.node);

  return {
    id:
      supplier.name !== null ? 'definition' : supplier.through === 'override' ? 'override' : 'band',
    what: naming(supplier),
    moves,
    alone: false,
    intent: {
      kind: 'edit',
      file: found.file,
      patch: { ops },
      expects: {
        cells: new Set(moves.map((one) => qualified(one.sheet as SheetName, one.at))),
        beyond: 'ask',
      },
    },
  };
}

/** Whether the look comes from an override's own style, under which anything written on the cell is invisible. */
function excepted(supplier: StyleLayer): boolean {
  return supplier.through === 'override' && supplier.name === null;
}

/** What the answer that reaches beyond the rectangle says it would change. */
function naming(supplier: StyleLayer): string {
  if (supplier.name !== null) {
    return `Change \`${supplier.name}\`, which every cell reading it follows`;
  }

  if (supplier.through === 'override') return 'Change the override that says how this cell looks';

  return supplier.through === 'column'
    ? 'Change the column it is set on, which is the whole column'
    : 'Change the row it is set on, which is the whole row';
}

/** The properties written into a mapping that already has some of them, as deep as its keys go. */
function writing(
  found: Found & { kind: 'found' },
  into: string | null,
  want: StyleValues,
): Op[] | null {
  const ops: Op[] = [];

  for (const key of properties(want)) {
    const path = into === null ? key.split('.') : [into, ...key.split('.')];
    const op = under(found.node, [...found.path], path, want[key]);
    if (op === null) return null;

    ops.push(op);
  }

  return ops;
}

/** The op that puts one leaf in: a `set` where the key is there, and the keys it is missing where not. */
function under(node: Node, at: Path, path: readonly string[], value: unknown): Op | null {
  const [head, ...rest] = path;
  if (head === undefined) return null;
  if (node.kind !== 'map') return null;

  const held = node.entries.find((entry) => String(entry.key.value) === head);
  if (held === undefined) {
    const gives = { [path.join('.')]: value } as StyleValues;
    const source = written({ kind: 'inline', gives })
      .replace(/^\{ |\}$/g, '')
      .trim();
    return { op: 'addSource', path: at, key: head, source: source.slice(head.length + 2) };
  }

  if (rest.length === 0) return { op: 'set', path: [...at, head], value: value as never };

  return under(held.value, [...at, head], rest, value);
}

/** The addresses of a rectangle, in reading order. */
function spread(rect: Rect): A1Addr[] {
  const addresses: A1Addr[] = [];
  for (let row = rect.top; row <= rect.bottom; row += 1) {
    for (let col = rect.left; col <= rect.right; col += 1) addresses.push(addrAt({ col, row }));
  }

  return addresses;
}

/** The rectangle as a reader would name it in an answer. */
function said(addresses: readonly A1Addr[]): string {
  const first = addresses[0];
  const last = addresses[addresses.length - 1];
  if (first === undefined || last === undefined) return 'nothing';

  return first === last ? `\`${first}\`` : `the ${addresses.length} cells from \`${first}\``;
}

/** The node a cell's look would be written on, where one construct wrote the cell. */
function nodeOf(origin: FacetOrigin): NodeId | null {
  if (origin.kind === 'formulaRange' || origin.kind === 'empty') {
    return origin.kind === 'empty' ? origin.node : null;
  }

  return origin.node;
}

function properties(values: StyleValues): StyleProperty[] {
  return STYLE_PROPERTIES.filter((key) => values[key] !== undefined);
}

const STYLE = 'style';
const CELLS = 'cells';
