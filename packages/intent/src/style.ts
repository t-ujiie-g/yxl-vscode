import {
  type CompiledSheet,
  type FullAddr,
  type StyleLayer,
  sheetOf,
  styleAt,
} from '@yxl-vscode/compile';
import { apply } from '@yxl-vscode/cst';
import { ordered, propertiesOf, type StyleProperty, type StyleSays } from '@yxl-vscode/spec';
import { type A1Addr, addrAt, qualified, type Rect, type SheetName } from '@yxl-vscode/units';
import type { Reading } from './direct';
import type { Candidate } from './resolve';
import { atSupplier, onEvery, type Styling, type Wanted, type Writing } from './writes';

export type { Styling } from './writes';

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
  const wanted = propertiesOf(want);
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
  const addresses = spread(where.rect);
  const wants = everyone(addresses, want);
  const hidden = from.some((one) => one.layer !== null && excepted(one.layer));
  const alike = hidden ? null : onEvery(spec, sheet, where.sheet, wants, read);
  const split = splitting(spec, sheet, where.sheet, from, want, read);

  const answers: Candidate[] = [];
  if (alike !== null && alike.ops.length > 0) {
    answers.push(
      candidate('all', `Put it on ${said(addresses)}, whatever they take it from now`, alike),
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
    const some = ordered(want, group.keys);
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

/** Whether the look comes from an override's own style, under which anything written on the cell is invisible. */
function excepted(supplier: StyleLayer): boolean {
  return supplier.through === 'override' && supplier.name === null;
}

/** Whether it comes from a key of the cell's own — which is not somewhere else, it is the cell. */
function itsOwn(supplier: StyleLayer): boolean {
  return supplier.through === 'cell' && supplier.name === null;
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

/** Every address of a rectangle asked for the whole look. */
function everyone(addresses: readonly A1Addr[], want: StyleSays): Wanted[] {
  return addresses.map((at) => ({ at, want }));
}
