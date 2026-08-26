import {
  addressesIn,
  type CompiledBand,
  type CompiledSheet,
  type FullAddr,
  REACH,
  type StyleLayer,
  sheetOf,
  styleAt,
} from '@yxl-vscode/compile';
import { apply } from '@yxl-vscode/cst';
import { normalize, written as spell } from '@yxl-vscode/normalize';
import { KEY, ordered, propertiesOf, type StyleProperty, type StyleSays } from '@yxl-vscode/spec';
import {
  type A1Addr,
  addressesOf,
  cellOf,
  qualified,
  type Rect,
  type SheetName,
  within,
} from '@yxl-vscode/units';
import { bandOfItsOwn, type Span, spelled } from './bands';
import type { Reading } from './direct';
import type { Candidate } from './resolve';
import {
  asException,
  atSupplier,
  onBand,
  onEvery,
  type Projection,
  type Wanted,
  type Writing,
} from './writes';

export type { Projection } from './writes';

/** Where a look was asked for: the rectangle, and whether the reader took whole columns or rows. */
export interface Over {
  readonly sheet: SheetName;
  readonly rect: Rect;
  readonly whole?: 'columns' | 'rows' | null;
}

/**
 * Every way of making a rectangle look as the reader asked — the `setStyle`
 * table. Where one answer is the whole answer it says so, and the
 * caller may take it without asking (ADR-001).
 */
export function setStyle(
  spec: Projection,
  where: Over,
  want: StyleSays,
  read: Reading,
): readonly Candidate[] {
  const sheet = sheetOf(spec.grid, where.sheet);
  const wanted = propertiesOf(want);
  if (sheet === null || wanted.length === 0) return [];

  const from = origins(sheet, addressesOf(where.rect), wanted);
  const answers =
    from.length > 1
      ? apart(spec, sheet, where, from, want, read)
      : fromOne(spec, sheet, where, from[0]?.layer ?? null, want, read);

  return answers.length === 1 ? [{ ...answers[0], alone: true } as Candidate] : answers;
}

/** The span a whole-column or whole-row selection names, or `null` where it named cells. */
function spanning(where: Over): Span | null {
  if (where.whole === 'columns') {
    return { axis: 'column', first: where.rect.left, last: where.rect.right };
  }
  if (where.whole === 'rows')
    return { axis: 'row', first: where.rect.top, last: where.rect.bottom };

  return null;
}

/** The answer that writes the look on a band: a whole column is a band, never four hundred cells (ADR-041). */
function asBand(
  spec: Projection,
  sheet: CompiledSheet,
  span: Span,
  want: StyleSays,
  read: Reading,
): Candidate | null {
  const moves = inSpan(sheet, span).map((at) => ({ sheet: sheet.name, at }));
  const many = span.last - span.first + 1;
  const what = `Write it on the ${span.axis}${many === 1 ? '' : 's'} \`${spelled(span)}\``;

  const bands = span.axis === 'column' ? sheet.columns : sheet.rows;
  const over = bands.findLast((band) => band.first === span.first && band.last === span.last);

  // A band already over exactly this span *is* the band of its own, so the look
  // goes into it — two entries with one `at` would be one band said twice.
  const writing =
    over === undefined
      ? ofItsOwn(spec, sheet, span, want, read)
      : onBand(spec, others(bands, over, span), over, read, want);
  if (writing === null || writing.ops.length === 0) return null;

  return {
    id: 'ofItsOwn',
    what,
    moves,
    alone: false,
    intent: {
      kind: 'edit',
      file: writing.file,
      patch: { ops: writing.ops },
      expects: {
        cells: new Set(moves.map((one) => qualified(one.sheet, one.at))),
        beyond: 'ask',
      },
    },
  };
}

/** The layers still under a band once it is taken out: the other bands of that axis over the same span. */
function others(
  bands: readonly CompiledBand[],
  over: CompiledBand,
  span: Span,
): readonly StyleLayer[] {
  return bands
    .filter((band) => band !== over && band.first <= span.first && band.last >= span.last)
    .flatMap((band) => band.style);
}

/** The answer where no band covers the span yet: one written for it, through the normalizer. */
function ofItsOwn(
  spec: Projection,
  sheet: CompiledSheet,
  span: Span,
  want: StyleSays,
  read: Reading,
): Writing | null {
  const how = normalize(want, spec.grid.styles);
  if (how === null) return null;

  const written = bandOfItsOwn(sheet, span, [[KEY.style, spell(how)]], read);
  return written === null ? null : { file: written.found.file, ops: [written.op], moves: [] };
}

/** Every address the sheet holds a cell at inside the span, which is what a band there would move. */
function inSpan(sheet: CompiledSheet, span: Span): A1Addr[] {
  const inside = (at: A1Addr) => {
    const cell = cellOf(at);
    const one = span.axis === 'column' ? cell.col : cell.row;
    return one >= span.first && one <= span.last;
  };

  return addressesIn(sheet, REACH).filter(inside);
}

/** The answers where every cell of the rectangle takes the look from the same place. */
function fromOne(
  spec: Projection,
  sheet: CompiledSheet,
  where: Over,
  supplier: StyleLayer | null,
  want: StyleSays,
  read: Reading,
): readonly Candidate[] {
  const answers: Candidate[] = [];
  const span = spanning(where);

  if (span !== null) {
    const band = asBand(spec, sheet, span, want, read);
    if (band !== null) answers.push(band);
  } else if (supplier === null || !excepted(supplier)) {
    const own = onCells(spec, sheet, where.sheet, everyone(addressesOf(where.rect), want), read);
    if (own === null) answers.push(...inFill(spec, sheet, where, want, read));
    else answers.push(own);
  }

  const shared = elsewhere(spec, supplier, want, read);
  if (shared !== null) answers.unshift(shared);

  return answers;
}

/** The answers one cell inside a `formulas:` range has: an exception, or the whole run (§3, §23). */
function inFill(
  spec: Projection,
  sheet: CompiledSheet,
  where: Over,
  want: StyleSays,
  read: Reading,
): readonly Candidate[] {
  const [at, ...rest] = addressesOf(where.rect);
  if (at === undefined || rest.length > 0) return [];

  const fill = sheet.fills.find((one) => within(cellOf(at), one.rect));
  if (fill === undefined) return [];

  const answers: Candidate[] = [];
  const written = asException(spec, sheet, where.sheet, at, want, read);
  if (written !== null) {
    answers.push({
      id: 'exception',
      what: `Write it as an override on \`${at}\``,
      moves: [{ sheet: sheet.name, at }],
      alone: false,
      intent: written,
    });
  }

  const along = runsDown(fill.rect) ? column(at) : row(at);
  const band = asBand(spec, sheet, along, want, read);
  if (band !== null) answers.push(band);

  return answers;
}

/** Which way a filled range runs, which is the band that reaches every cell of it. */
function runsDown(rect: Rect): boolean {
  return rect.bottom - rect.top >= rect.right - rect.left;
}

const column = (at: A1Addr): Span => ({
  axis: 'column',
  first: cellOf(at).col,
  last: cellOf(at).col,
});

const row = (at: A1Addr): Span => ({ axis: 'row', first: cellOf(at).row, last: cellOf(at).row });

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

/** The two answers a rectangle has whose cells take the look from different places. */
function apart(
  spec: Projection,
  sheet: CompiledSheet,
  where: Over,
  from: readonly Origin[],
  want: StyleSays,
  read: Reading,
): readonly Candidate[] {
  const addresses = addressesOf(where.rect);
  const wants = everyone(addresses, want);
  const hidden = from.some((one) => one.layer !== null && excepted(one.layer));
  const alike = hidden ? null : onEvery(spec, sheet, where.sheet, wants, read);
  const split = splitting(spec, sheet, where.sheet, from, want, read);

  // Over a whole column the band is the answer, and the two below would write a
  // cell entry per row of the sheet — which is not what any of them meant.
  const span = spanning(where);
  if (span !== null) {
    const band = asBand(spec, sheet, span, want, read);
    return band === null ? [] : [band];
  }

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
  spec: Projection,
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
  spec: Projection,
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
  spec: Projection,
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
