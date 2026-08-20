import {
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  type FacetOrigin,
  type FullAddr,
  reaches,
  resolve,
  type StyleLayer,
  sheetOf,
  styleAt,
} from '@yxl-vscode/compile';
import { apply, type Node, type Op, type Path, renderScalar } from '@yxl-vscode/cst';
import { normalize, written } from '@yxl-vscode/normalize';
import {
  STYLE_PROPERTIES,
  type StyleProperty,
  type StyleSays,
  type StyleValues,
} from '@yxl-vscode/spec';
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
  want: StyleSays,
  read: Reading,
): readonly Candidate[] {
  const sheet = sheetOf(spec.grid, where.sheet);
  const wanted = properties(want);
  if (sheet === null || wanted.length === 0) return [];

  const from = origins(sheet, spread(where.rect), wanted);
  const answers =
    from.length > 1
      ? apart(spec, sheet, where, from, want, read)
      : fromOne(spec, sheet, where, from[0]?.layer ?? null, want, read);

  return answers.length === 1 ? [{ ...answers[0], alone: true } as Candidate] : answers;
}

/** The answers where every cell of the rectangle takes the look from the same place. */
function fromOne(
  spec: Styling,
  sheet: CompiledSheet,
  where: { sheet: SheetName; rect: Rect },
  supplier: StyleLayer | null,
  want: StyleSays,
  read: Reading,
): readonly Candidate[] {
  const answers: Candidate[] = [];
  if (supplier === null || !excepted(supplier)) {
    const own = onCells(spec, sheet, where.sheet, everyone(spread(where.rect), want), read);
    if (own !== null) answers.push(own);
  }

  const shared = elsewhere(spec, supplier, want, read);
  if (shared !== null) answers.unshift(shared);

  return answers;
}

/** A look asked for over one address: which of its properties are to land there. */
interface Wanted {
  readonly at: A1Addr;
  readonly want: StyleSays;
}

/** What one answer would write, and every cell it would move. */
interface Writing {
  readonly file: FilePath;
  readonly ops: readonly Op[];
  readonly moves: readonly FullAddr[];
}

/** One layer, the properties it supplies, and the cells that read them from it. */
interface Origin {
  readonly layer: StyleLayer | null;
  readonly keys: readonly StyleProperty[];
  readonly addresses: readonly A1Addr[];
}

/** Where the rectangle takes each property from, grouped by the layer that supplies it (`null` where none does). */
function origins(
  sheet: CompiledSheet,
  addresses: readonly A1Addr[],
  wanted: readonly StyleProperty[],
): Origin[] {
  const grouped = new Map<
    string,
    { layer: StyleLayer | null; keys: Set<StyleProperty>; addresses: Set<A1Addr> }
  >();

  for (const at of addresses) {
    const layers = styleAt(sheet, at);
    for (const key of wanted) {
      const layer = layers.findLast((one) => one.gives[key] !== undefined) ?? null;
      const group = grouped.get(layer?.node ?? '') ?? {
        layer,
        keys: new Set<StyleProperty>(),
        addresses: new Set<A1Addr>(),
      };
      group.keys.add(key);
      group.addresses.add(at);
      grouped.set(layer?.node ?? '', group);
    }
  }

  return [...grouped.values()].map((one) => ({
    layer: one.layer,
    keys: [...one.keys],
    addresses: [...one.addresses],
  }));
}

/** The two answers §4.4 gives a rectangle whose cells take the look from different places. */
function apart(
  spec: Styling,
  sheet: CompiledSheet,
  where: { sheet: SheetName; rect: Rect },
  from: readonly Origin[],
  want: StyleSays,
  read: Reading,
): readonly Candidate[] {
  const wants = everyone(spread(where.rect), want);
  const hidden = from.some((one) => one.layer !== null && excepted(one.layer));
  const alike = hidden ? null : onEvery(spec, sheet, where.sheet, wants, read);
  const split = splitting(spec, sheet, where.sheet, from, want, read);

  const answers: Candidate[] = [];
  if (alike !== null && alike.ops.length > 0) {
    answers.push(
      candidate('all', 'Apply it to every cell here, whatever each takes it from', alike),
    );
  }
  if (split !== null && !(alike !== null && same(alike, split, read))) {
    answers.push(candidate('split', 'Split it by where each cell takes it from', split));
  }

  return answers;
}

/** Whether two answers would leave the file the same, which makes them one answer rather than a question. */
function same(one: Writing, than: Writing, read: Reading): boolean {
  if (one.file !== than.file) return false;

  const text = read.text(one.file);
  if (text === null) return false;

  const written = after(text, one);
  return written !== null && written === after(text, than);
}

/** The file as an answer would leave it, or `null` where any of its ops is refused. */
function after(text: string, writing: Writing): string | null {
  const done = apply(text, writing.ops, { file: writing.file });
  return done.diagnostics.length === 0 ? done.text : null;
}

/** Each origin changed where it lives, with the cells nothing supplies written on themselves. */
function splitting(
  spec: Styling,
  sheet: CompiledSheet,
  name: SheetName,
  from: readonly Origin[],
  want: StyleSays,
  read: Reading,
): Writing | null {
  const own = new Map<A1Addr, StyleSays>();
  const parts: Writing[] = [];

  for (const group of from) {
    const some = only(want, group.keys);
    if (group.layer === null || itsOwn(group.layer)) {
      for (const at of group.addresses) own.set(at, { ...own.get(at), ...some });
      continue;
    }

    const one = atSupplier(spec, group.layer, some, read);
    if (one === null) return null;

    parts.push(one);
  }

  if (own.size > 0) {
    const wants = [...own].map(([at, some]) => ({ at, want: some }));
    const one = onEvery(spec, sheet, name, wants, read);
    if (one === null) return null;

    parts.push(one);
  }

  return joined(parts);
}

/** Several answers as one, which they can only be where they all write the same file. */
function joined(parts: readonly Writing[]): Writing | null {
  const file = parts[0]?.file;
  const ops = parts.flatMap((one) => one.ops);
  if (file === undefined || ops.length === 0) return null;
  if (parts.some((one) => one.file !== file)) return null;

  const moves = new Map<string, FullAddr>();
  for (const part of parts) {
    for (const move of part.moves) moves.set(`${move.sheet}!${move.at}`, move);
  }

  return { file, ops, moves: [...moves.values()] };
}

/** An answer as the reader is offered it, claiming exactly the cells it moves. */
function candidate(id: string, what: string, writing: Writing): Candidate {
  return {
    id,
    what,
    moves: writing.moves,
    alone: false,
    intent: {
      kind: 'edit',
      file: writing.file,
      patch: { ops: writing.ops },
      expects: {
        cells: new Set(writing.moves.map((one) => qualified(one.sheet as SheetName, one.at))),
        beyond: 'ask',
      },
    },
  };
}

/** The answer that writes it on the cells themselves, over what each already contributes (ADR-008, ADR-037). */
function onCells(
  spec: Styling,
  sheet: CompiledSheet,
  name: SheetName,
  wants: readonly Wanted[],
  read: Reading,
): Candidate | null {
  const writing = onEvery(spec, sheet, name, wants, read);
  if (writing === null || writing.ops.length === 0) return null;

  return candidate('onCells', `Write it on ${said(wants.map((one) => one.at))}`, writing);
}

/** What writing the look on each of those cells would be — no ops where they already look as asked. */
function onEvery(
  spec: Styling,
  sheet: CompiledSheet,
  name: SheetName,
  wants: readonly Wanted[],
  read: Reading,
): Writing | null {
  const ops = new Map<FilePath, Op[]>();

  for (const one of wants) {
    const written = onCell(spec, sheet, one.at, one.want, read);
    if (written === null) return null;

    ops.set(written.file, [...(ops.get(written.file) ?? []), ...written.ops]);
  }

  const files = [...ops.keys()];
  const file = files[0];
  if (file === undefined || files.length > 1) return null;

  return {
    file,
    ops: ops.get(file) ?? [],
    moves: wants.map((one) => ({ sheet: name, at: one.at })),
  };
}
/** One key of a cell as the ask leaves it: the source to write there, or `null` to take the key out. */
interface Carries {
  readonly key: string;
  readonly source: string | null;
}

/** The cell's own keys, rewritten as what they contribute now plus what was asked for. */
function onCell(
  spec: Styling,
  sheet: CompiledSheet,
  at: A1Addr,
  want: StyleSays,
  read: Reading,
): { file: FilePath; ops: readonly Op[] } | null {
  const layers = styleAt(sheet, at);
  const own = layers.filter(fromCell);
  // A cell's own `format:` layers over a declaration it names (`docs/spec.md` §6).
  const inStyle = resolve(own.filter((one) => one.name === null)).format !== undefined;

  const carries = [
    ...asStyle(spec, layers, own, inStyle ? want : without(want, FORMAT)),
    ...(inStyle ? [] : asFormat(layers, want)),
  ];

  const cell = cellAt(sheet, at);
  const node = cell === null ? null : nodeOf(cell.provenance.value);
  if (node === null) return newCell(sheet, at, carries, read);

  const found = located(node, read);
  if (found.kind === 'refused') return null;

  // `A1: 1` has nowhere to put a look; it becomes the cell the long way round.
  if (found.node.kind === 'scalar') {
    const written = carries.filter((one) => one.source !== null);
    if (written.length === 0) return { file: found.file, ops: [] };

    const keys = written.map((one) => `${one.key}: ${one.source}`).join(', ');
    const whole = `{ value: ${found.node.source}, ${keys} }`;
    return { file: found.file, ops: [{ op: 'write', path: found.path, source: whole }] };
  }
  if (found.node.kind !== 'map') return null;

  return { file: found.file, ops: intoCell(found, carries, read) };
}

/** The look the cell's `style:` would carry, where the ask reaches it at all (ADR-008, ADR-037). */
function asStyle(
  spec: Styling,
  layers: readonly StyleLayer[],
  own: readonly StyleLayer[],
  want: StyleSays,
): Carries[] {
  if (properties(want).length === 0) return [];

  const under = resolve(layers.filter((one) => !fromCell(one)));
  const named = resolve(own.filter((one) => one.name !== null));
  const gives = beyond({ ...resolve(own), ...want }, under, named);

  const how = properties(gives).length === 0 ? null : normalize(gives, spec.grid.styles);
  return [{ key: STYLE, source: how === null ? null : written(how) }];
}

/** The `format:` the cell would carry: the ask itself, since one key holds all of it. */
function asFormat(layers: readonly StyleLayer[], want: StyleSays): Carries[] {
  const wanted = want.format;
  if (wanted === undefined) return [];

  const under = resolve(layers.filter((one) => !ownFormat(one))).format;
  const supplied = under !== undefined && under !== null;
  if (wanted === under || (wanted === null && !supplied)) return [{ key: FORMAT, source: null }];

  return [{ key: FORMAT, source: wanted === null ? 'null' : renderScalar(wanted, 'double') }];
}

/** Whether the layer is the cell's own `format:` key, which the ask replaces outright. */
function ownFormat(layer: StyleLayer): boolean {
  return layer.through === 'cell' && layer.key === 'format';
}

/** The ops that put each key where it goes; a cell left holding only a value is that value again. */
function intoCell(
  found: Found & { kind: 'found' },
  carries: readonly Carries[],
  read: Reading,
): Op[] {
  if (found.node.kind !== 'map') return [];

  const held = (key: string) => found.node.kind === 'map' && has(found.node.entries, key);
  const gone = carries.filter((one) => one.source === null && held(one.key)).map((one) => one.key);
  const rest = found.node.entries.filter((entry) => !gone.includes(String(entry.key.value)));
  const only = rest.length === 1 && rest[0]?.key.value === 'value' ? rest[0] : undefined;

  if (only !== undefined && gone.length > 0) {
    const source = read.text(found.file)?.slice(only.value.span.start, only.value.span.end) ?? null;
    if (source !== null) return [{ op: 'write', path: found.path, source }];
  }

  return carries.flatMap((one) => {
    if (one.source === null) {
      return held(one.key) ? [{ op: 'remove', path: [...found.path, one.key] } as Op] : [];
    }
    return [
      held(one.key)
        ? ({ op: 'write', path: [...found.path, one.key], source: one.source } as Op)
        : ({ op: 'addSource', path: found.path, key: one.key, source: one.source } as Op),
    ];
  });
}

function has(entries: readonly { key: { value: unknown } }[], key: string): boolean {
  return entries.some((entry) => entry.key.value === key);
}

/** The look narrowed to everything but one property, which is written somewhere else. */
function without(want: StyleSays, key: StyleProperty): StyleSays {
  return only(
    want,
    properties(want).filter((one) => one !== key),
  );
}

/** The look with what it need not say taken out; what a declaration the cell *names* says stays, and is answered. */
function beyond(gives: StyleSays, under: StyleSays, named: StyleSays): StyleSays {
  const kept: Record<string, unknown> = {};

  for (const key of properties(gives)) {
    const same = under[key] === gives[key];
    const nothing = gives[key] === false || gives[key] === null;
    const off = nothing && !supplied(under, key) && !supplied(named, key);
    if (!same && !off) kept[key] = gives[key];
  }

  return kept as StyleSays;
}

/** Whether a look hands the cell the attribute at all: `null` is a layer saying it does not. */
function supplied(said: StyleSays, key: StyleProperty): boolean {
  return said[key] !== undefined && said[key] !== null;
}

/** A look on an address nothing writes: a cell that carries formatting and no value (`docs/spec.md` §3). */
function newCell(
  sheet: CompiledSheet,
  at: A1Addr,
  carries: readonly Carries[],
  read: Reading,
): { file: FilePath; ops: readonly Op[] } | null {
  const written = carries.filter((one) => one.source !== null);
  if (written.length === 0) return null;

  const found = located(sheet.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const holds = found.node.entries.some((entry) => entry.key.value === CELLS);
  const entry = written.map((one) => `${one.key}: ${one.source}`).join(', ');
  const body = written.length === 1 ? entry : `{ ${entry} }`;

  return {
    file: found.file,
    ops: [
      holds
        ? { op: 'addSource', path: [...found.path, CELLS], key: at, source: body }
        : { op: 'addSource', path: found.path, key: CELLS, source: `${at}:\n  ${body}` },
    ],
  };
}

/** The answer that changes what the look comes from: a declaration, a band, or the override over it. */
function elsewhere(
  spec: Styling,
  supplier: StyleLayer | null,
  want: StyleSays,
  read: Reading,
): Candidate | null {
  if (supplier === null || itsOwn(supplier)) return null;

  const writing = atSupplier(spec, supplier, want, read);
  if (writing === null) return null;

  const id =
    supplier.name !== null ? 'definition' : supplier.through === 'override' ? 'override' : 'band';

  return candidate(id, naming(supplier), writing);
}

/** What changing one supplying layer would be, over every cell that reads it. */
function atSupplier(
  spec: Styling,
  supplier: StyleLayer,
  want: StyleSays,
  read: Reading,
): Writing | null {
  const found = located(supplier.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const into = supplier.key === 'style' && supplier.name === null ? STYLE : null;
  const ops = writing(found, into, want);
  if (ops === null) return null;

  return { file: found.file, ops, moves: reaches(spec.grid, supplier.node) };
}

/** Whether the look comes from an override's own style, under which anything written on the cell is invisible. */
function excepted(supplier: StyleLayer): boolean {
  return supplier.through === 'override' && supplier.name === null;
}

/** Whether it comes from a key of the cell's own — which is not somewhere else, it is the cell. */
function itsOwn(supplier: StyleLayer): boolean {
  return supplier.through === 'cell' && supplier.name === null;
}

/** Whether the cell's own `style:` put it there, a declaration it names included: rewriting that key replaces all of it. */
function fromCell(layer: StyleLayer): boolean {
  return layer.through === 'cell' && layer.key === 'style';
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
  want: StyleSays,
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

/** The op one leaf becomes: a `set` where the key is there, the keys it is missing where not, a `remove` where it is asked off. */
function under(node: Node, at: Path, path: readonly string[], value: unknown): Op | null {
  const [head, ...rest] = path;
  if (head === undefined) return null;
  if (node.kind !== 'map') return null;

  const held = node.entries.find((entry) => String(entry.key.value) === head);
  if (held === undefined) {
    if (value === null) return null;

    const gives = { [path.join('.')]: value } as StyleValues;
    const source = written({ kind: 'inline', gives })
      .replace(/^\{ |\}$/g, '')
      .trim();
    return { op: 'addSource', path: at, key: head, source: source.slice(head.length + 2) };
  }

  if (rest.length === 0) {
    return value === null
      ? { op: 'remove', path: [...at, head] }
      : { op: 'set', path: [...at, head], value: value as never };
  }

  const deeper = under(held.value, [...at, head], rest, value);
  if (deeper?.op === 'remove' && deeper.path.length === at.length + 2 && sole(held.value)) {
    return { op: 'remove', path: [...at, head] };
  }

  return deeper;
}

/** Whether a mapping holds the one entry only, so taking that out would leave it empty. */
function sole(node: Node): boolean {
  return node.kind === 'map' && node.entries.length === 1;
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

function properties(values: StyleSays): StyleProperty[] {
  return STYLE_PROPERTIES.filter((key) => values[key] !== undefined);
}

const STYLE = 'style';
const FORMAT = 'format';
const CELLS = 'cells';

/** Every address of a rectangle asked for the whole look. */
function everyone(addresses: readonly A1Addr[], want: StyleSays): Wanted[] {
  return addresses.map((at) => ({ at, want }));
}

/** The look narrowed to the properties named. */
function only(want: StyleSays, keys: readonly StyleProperty[]): StyleSays {
  const kept: Record<string, unknown> = {};
  for (const key of keys) kept[key] = want[key];
  return kept as StyleSays;
}
