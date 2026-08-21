import { type CompiledBand, type CompiledSheet, sheetOf } from '@yxl-vscode/compile';
import { entryOf, holds, type Node, type Op } from '@yxl-vscode/cst';
import { type Axis, BAND_KEYS } from '@yxl-vscode/spec';
import type { SheetName } from '@yxl-vscode/units';
import { bandOfItsOwn, type Span, spelled } from './bands';
import { type Found, located, type Reading } from './direct';
import type { Candidate } from './resolve';
import type { Projection } from './writes';

/**
 * Columns dragged to a width in character units, or rows to a height in points.
 * The span is what the reader had selected, and one column where they had not.
 */
export interface Dragged {
  readonly sheet: SheetName;
  readonly axis: Axis;
  readonly first: number;
  readonly last: number;
  readonly size: number;
}

/**
 * Every way of making those columns that wide — `ROADMAP.md` §4.4's `setSize`
 * table, over a span. A size is a band, never forty cells, so a band that
 * reaches past what was dragged is a question rather than an answer.
 */
export function setSize(spec: Projection, dragged: Dragged, read: Reading): readonly Candidate[] {
  const sheet = sheetOf(spec.grid, dragged.sheet);
  if (sheet === null || dragged.first < 1 || dragged.last < dragged.first || dragged.size < 0) {
    return [];
  }

  const span = spanOf(dragged);
  const bands = dragged.axis === 'column' ? sheet.columns : sheet.rows;

  // A band already over exactly this span is the band of its own, whether or
  // not it is what sizes them today (ADR-042).
  const exact = bands.findLast((band) => band.first === span.first && band.last === span.last);
  if (exact !== undefined) {
    const one = theBand(exact, dragged, read);
    return one === null ? [] : [{ ...one, alone: true }];
  }

  const over = bands.filter((band) => sizes(band, span));
  if (over.length === 0) {
    const own = ofItsOwn(sheet, dragged, read);
    return own === null ? [] : [{ ...own, alone: true }];
  }

  // Several bands size what was dragged, and each of them reaches past it: one
  // band over the span layers over them all, which is the only tidy answer.
  const one = over.length === 1 ? over[0] : undefined;
  if (one === undefined) {
    const own = ofItsOwn(sheet, dragged, read);
    return own === null ? [] : [{ ...own, alone: true }];
  }

  return [theBand(one, dragged, read), apart(one, dragged, read)].filter(
    (band): band is Candidate => band !== null,
  );
}

/** Whether the band is what gives any of them its size, which a band setting no size does not. */
function sizes(band: CompiledBand, span: Span): boolean {
  return band.size !== null && band.first <= span.last && band.last >= span.first;
}

/** The answer that writes a band for what was dragged, where nothing sizes it yet. */
function ofItsOwn(sheet: CompiledSheet, dragged: Dragged, read: Reading): Candidate | null {
  const written = bandOfItsOwn(
    sheet,
    spanOf(dragged),
    [[BAND_KEYS[dragged.axis].size, String(dragged.size)]],
    read,
  );
  if (written === null) return null;

  const many = dragged.last - dragged.first + 1;
  const what =
    many === 1
      ? `Write a ${dragged.axis} of its own`
      : `Write one ${dragged.axis} band over \`${spelled(spanOf(dragged))}\``;

  return answer('ofItsOwn', what, written.found, [written.op]);
}

/** The columns or rows a drag names, as a span. */
function spanOf(dragged: Dragged): Span {
  return { axis: dragged.axis, first: dragged.first, last: dragged.last };
}

/** The answer that changes the band the size comes from, every column of it included. */
function theBand(band: CompiledBand, dragged: Dragged, read: Reading): Candidate | null {
  const found = located(band.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const key = BAND_KEYS[dragged.axis].size;
  const many = band.last - band.first + 1;
  const what =
    many === 1
      ? `Change the band over \`${spelled({ axis: dragged.axis, first: band.first, last: band.last })}\``
      : `Change the band over \`${spelled({ axis: dragged.axis, first: band.first, last: band.last })}\`, which is ${many} ${dragged.axis}s`;

  const op: Op = holds(found.node, key)
    ? { op: 'set', path: [...found.path, key], value: dragged.size }
    : { op: 'add', path: found.path, key, value: dragged.size, before: null };

  return answer('band', what, found, [op]);
}

/** The answer that splits the band so the one dragged stands alone, keeping every key it had. */
function apart(band: CompiledBand, dragged: Dragged, read: Reading): Candidate | null {
  const found = located(band.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const index = found.path[found.path.length - 1];
  const source = read.text(found.file);
  if (typeof index !== 'number' || source === null) return null;

  // Rewritten is the `at` as written: a `${...}` there would be written over
  // with whatever it resolved to.
  if (
    spelt(found.node, 'at') !== spelled({ axis: dragged.axis, first: band.first, last: band.last })
  )
    return null;

  const pieces: string[] = [];
  for (const run of around(band, spanOf(dragged))) {
    const at = spelled({ axis: dragged.axis, first: run.first, last: run.last });
    const own = run.first === dragged.first && run.last === dragged.last;
    const said = respelled(source, found.node, [
      ['at', at],
      ...(own ? [[BAND_KEYS[dragged.axis].size, String(dragged.size)] as const] : []),
    ]);
    if (said === null) return null;

    pieces.push(said);
  }

  const [first, ...rest] = pieces;
  if (first === undefined) return null;

  // Items added at one place are spliced from the end, so the last laid down reads first.
  const ops: Op[] = [
    { op: 'write', path: found.path, source: first },
    ...rest.reverse().map(
      (piece): Op => ({
        op: 'insertSource',
        path: found.path.slice(0, -1),
        index: index + 1,
        source: deindented(piece),
      }),
    ),
  ];

  const what = `Split it so \`${spelled(spanOf(dragged))}\` stands alone`;
  return answer('apart', what, found, ops);
}

/** An answer as the reader is offered it; a size moves no cell, so it claims none. */
function answer(
  id: string,
  what: string,
  found: Found & { kind: 'found' },
  ops: readonly Op[],
): Candidate {
  return {
    id,
    what,
    moves: [],
    alone: false,
    intent: {
      kind: 'edit',
      file: found.file,
      patch: { ops },
      expects: { cells: new Set(), beyond: 'refuse' },
    },
  };
}

/** The runs a band falls into once the span dragged is taken out of it. */
function around(band: CompiledBand, span: Span): { first: number; last: number }[] {
  const runs = [{ first: span.first, last: span.last }];
  if (band.first < span.first) runs.unshift({ first: band.first, last: span.first - 1 });
  if (span.last < band.last) runs.push({ first: span.last + 1, last: band.last });

  return runs;
}

/** The band's own text with some of its values written over, so a piece keeps every key it had. */
function respelled(
  source: string,
  node: Node & { kind: 'map' },
  changes: readonly (readonly [string, string])[],
): string | null {
  const from = node.span.start;
  const spans = changes.map(([key, value]) => [entryOf(node, key), value] as const);
  if (spans.some(([entry]) => entry === undefined)) return null;

  let said = source.slice(from, node.span.end);
  for (const [entry, value] of [...spans].sort(
    (one, than) => (than[0]?.value.span.start ?? 0) - (one[0]?.value.span.start ?? 0),
  )) {
    if (entry === undefined) return null;
    said =
      said.slice(0, entry.value.span.start - from) +
      value +
      said.slice(entry.value.span.end - from);
  }

  return said;
}

/** The same text with the indentation of a block taken off, since an insert puts its own back. */
function deindented(said: string): string {
  const [first, ...rest] = said.split('\n');
  if (first === undefined || rest.length === 0) return said;

  const indent = rest
    .filter((line) => line.trim() !== '')
    .map((line) => /^[ \t]*/.exec(line)?.[0].length ?? 0);
  const off = Math.min(...indent);

  return [first, ...rest.map((line) => line.slice(off))].join('\n');
}

/** One key of a mapping as the spec spells it, for a comparison against what it resolved to. */
function spelt(node: Node & { kind: 'map' }, key: string): string | null {
  const held = entryOf(node, key)?.value;
  return held?.kind === 'scalar' ? String(held.value) : null;
}
