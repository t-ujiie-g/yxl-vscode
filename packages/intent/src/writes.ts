import {
  type CompiledBand,
  type CompiledSheet,
  cellAt,
  type FacetOrigin,
  type FullAddr,
  reaches,
  resolve,
  type StyleLayer,
  styleAt,
} from '@yxl-vscode/compile';
import { holds, type Node, type Op, type Path, renderScalar } from '@yxl-vscode/cst';
import { normalize, written } from '@yxl-vscode/normalize';
import {
  ordered,
  propertiesOf,
  type StyleProperty,
  type StyleSays,
  type StyleValues,
} from '@yxl-vscode/spec';
import type { A1Addr, FilePath, NodeId, SheetName } from '@yxl-vscode/units';
import { soleBand } from './bands';
import { type Found, type Intent, located, type Projection, type Reading } from './direct';
import { override, type Says } from './override';

export type { Projection };

/** A look asked for over one address: which of its properties are to land there. */
export interface Wanted {
  readonly at: A1Addr;
  readonly want: StyleSays;
}

/** What one answer would write, and every cell it would move. */
export interface Writing {
  readonly file: FilePath;
  readonly ops: readonly Op[];
  readonly moves: readonly FullAddr[];
}

/** What writing the look on each of those cells would be — no ops where they already look as asked. */
export function onEvery(
  spec: Projection,
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
  spec: Projection,
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
  const from = cell?.provenance.value ?? null;

  // A `formulas:` range cannot carry a look and cannot be overlapped by a cell
  // either, so there is nowhere here to put one (`docs/spec.md` §3).
  if (from?.kind === 'formulaRange') return null;

  // Where a data block writes the value, the cell's own keys live in the
  // `cells:` entry beside it — the one a look already went into, if there is one.
  const beside = layers.find((one) => one.through === 'cell')?.node ?? null;
  const node = from === null ? null : filled(from) ? beside : nodeOf(from);
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

/**
 * The look written as an exception, which is where a cell inside a `formulas:`
 * range carries one (`docs/spec.md` §23, ADR-007); `null` where it has nothing
 * to say or the range keeps its formula there.
 */
export function asException(
  spec: Projection,
  sheet: CompiledSheet,
  name: SheetName,
  at: A1Addr,
  want: StyleSays,
  read: Reading,
): Intent | null {
  const layers = styleAt(sheet, at);
  const carries = [...asStyle(spec, layers, [], without(want, FORMAT)), ...asFormat(layers, want)];
  const said = carries.filter((one) => one.source !== null);
  if (said.length === 0) return null;

  const says: Says = Object.fromEntries(said.map((one) => [one.key, one.source]));
  const written = override(spec, { sheet: name, at }, says, read);

  return written.kind === 'edit' ? written : null;
}

/** The look the cell's `style:` would carry, where the ask reaches it at all (ADR-008, ADR-037). */
function asStyle(
  spec: Projection,
  layers: readonly StyleLayer[],
  own: readonly StyleLayer[],
  want: StyleSays,
): Carries[] {
  if (propertiesOf(want).length === 0) return [];

  const under = resolve(layers.filter((one) => !fromCell(one)));
  const named = resolve(own.filter((one) => one.name !== null));
  const mine = { ...resolve(own), ...want };

  // Measured with no declaration kept, since `normalize` decides whether one is
  // named at all — and nothing to say means no key rather than a map of nulls.
  const anything = propertiesOf(beyond(mine, under, {})).length > 0;
  const how = anything ? normalize(beyond(mine, under, named), spec.grid.styles) : null;

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

  const held = (key: string) => holds(found.node, key);
  const gone = carries.filter((one) => one.source === null && held(one.key)).map((one) => one.key);
  const rest = found.node.entries.filter((entry) => !gone.includes(String(entry.key.value)));
  const only = rest.length === 1 && rest[0]?.key.value === 'value' ? rest[0] : undefined;
  const writes = carries.some((one) => one.source !== null);

  // A cell written for its look alone goes when the look does (`docs/spec.md` §3).
  if (rest.length === 0 && gone.length > 0 && !writes) {
    return [{ op: 'remove', path: found.path }];
  }

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

/** The look narrowed to everything but one property, which is written somewhere else. */
function without(want: StyleSays, key: StyleProperty): StyleSays {
  return ordered(
    want,
    propertiesOf(want).filter((one) => one !== key),
  );
}

/** The look with what it need not say taken out; what a declaration the cell *names* says stays, and is answered. */
function beyond(gives: StyleSays, under: StyleSays, named: StyleSays): StyleSays {
  const kept: Record<string, unknown> = {};

  for (const key of propertiesOf(gives)) {
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

/** Whether a `data:` block fills the cell, which carries no look of its own (`docs/spec.md` §9). */
function filled(from: FacetOrigin): boolean {
  return from.kind === 'inline' || from.kind === 'external';
}

/** A look where no `cells:` entry writes: an entry of its own, formatting and no value. */
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

  const already = holds(found.node, CELLS);
  const entry = written.map((one) => `${one.key}: ${one.source}`).join(', ');
  const body = written.length === 1 ? entry : `{ ${entry} }`;

  return {
    file: found.file,
    ops: [
      already
        ? { op: 'addSource', path: [...found.path, CELLS], key: at, source: body }
        : { op: 'addSource', path: found.path, key: CELLS, source: `${at}:\n  ${body}` },
    ],
  };
}

/**
 * The look a band would carry: what it says now with the ask over it, dropped
 * where the layers under it already say the same, and through the normalizer
 * (ADR-008). A band left saying nothing goes, and takes its entry with it.
 */
export function onBand(
  spec: Projection,
  under: readonly StyleLayer[],
  band: CompiledBand,
  read: Reading,
  want: StyleSays,
): Writing | null {
  const found = located(band.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const kept = beyond({ ...resolve(band.style), ...want }, resolve(under), {});
  const how = propertiesOf(kept).length === 0 ? null : normalize(kept, spec.grid.styles);
  const held = holds(found.node, STYLE);

  const ops = bandOps(found, how === null ? null : written(how), held, read);
  return { file: found.file, ops, moves: reaches(spec.grid, band.node) };
}

/** The ops that put a band's `style:` where it goes, take it out, or take the band with it. */
function bandOps(
  found: Found & { kind: 'found' },
  source: string | null,
  held: boolean,
  read: Reading,
): readonly Op[] {
  if (source !== null) {
    return held
      ? [{ op: 'write', path: [...found.path, STYLE], source }]
      : [{ op: 'addSource', path: found.path, key: STYLE, source }];
  }
  if (!held) return [];

  // A band written for its look alone goes when the look does, and takes the
  // `columns:` key with it where it was the only band under it.
  const rest = found.node.kind === 'map' ? found.node.entries.length : 0;
  if (rest > 2) return [{ op: 'remove', path: [...found.path, STYLE] }];

  return [{ op: 'remove', path: soleBand(found, read) ? found.path.slice(0, -1) : found.path }];
}

/** What changing one supplying layer would be, over every cell that reads it. */
export function atSupplier(
  spec: Projection,
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

/** The properties written into a mapping that already has some of them, as deep as its keys go. */
function writing(
  found: Found & { kind: 'found' },
  into: string | null,
  want: StyleSays,
): Op[] | null {
  const ops: Op[] = [];

  for (const key of propertiesOf(want)) {
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

/** The node a cell's look would be written on, where one construct wrote the cell. */
function nodeOf(origin: FacetOrigin): NodeId | null {
  if (origin.kind === 'formulaRange' || origin.kind === 'empty') {
    return origin.kind === 'empty' ? origin.node : null;
  }

  return origin.node;
}

const STYLE = 'style';
const FORMAT = 'format';
const CELLS = 'cells';

/** Whether the cell's own `style:` put it there, a declaration it names included: rewriting that key replaces all of it. */
function fromCell(layer: StyleLayer): boolean {
  return layer.through === 'cell' && layer.key === 'style';
}
