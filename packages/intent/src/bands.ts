import type { CompiledBand, CompiledSheet } from '@yxl-vscode/compile';
import { entryOf, type Node, nodeAt, type Op } from '@yxl-vscode/cst';
import { type Axis, BAND_KEYS } from '@yxl-vscode/spec';
import { columnLabel } from '@yxl-vscode/units';
import { type Found, located, type Reading } from './direct';
import type { Candidate } from './resolve';

/** A run of columns or rows a gesture names, as a band's `at` covers one. */
export interface Span {
  readonly axis: Axis;
  readonly first: number;
  readonly last: number;
}

/** A span as a band's `at` spells it: a column label or a row number, and a range as two of them. */
export function spelled(span: Span): string {
  const said = (at: number) => (span.axis === 'column' ? columnLabel(at) : String(at));
  return span.first === span.last ? said(span.first) : `${said(span.first)}-${said(span.last)}`;
}

/** What a band of a reader's own would be: where it goes, and the op that puts it there. */
export function bandOfItsOwn(
  sheet: CompiledSheet,
  span: Span,
  keys: readonly (readonly [string, string])[],
  read: Reading,
): { found: Found & { kind: 'found' }; op: Op } | null {
  const found = located(sheet.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const key = BAND_KEYS[span.axis].at;
  const body = [`at: ${spelled(span)}`, ...keys.map(([one, value]) => `${one}: ${value}`)].join(
    '\n',
  );
  const held = entryOf(found.node, key)?.value;

  const op: Op =
    held?.kind === 'seq'
      ? { op: 'insertSource', path: [...found.path, key], index: held.items.length, source: body }
      : { op: 'addSource', path: found.path, key, source: `- ${body.replaceAll('\n', '\n  ')}` };

  return { found, op };
}

/** An answer as the reader is offered it; a size moves no cell, so it claims none. */
export function answer(
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
export function around(band: CompiledBand, span: Span): { first: number; last: number }[] {
  const runs = [{ first: span.first, last: span.last }];
  if (band.first < span.first) runs.unshift({ first: band.first, last: span.first - 1 });
  if (span.last < band.last) runs.push({ first: span.last + 1, last: band.last });

  return runs;
}

/** The band's own text with some of its values written over, so a piece keeps every key it had. */
export function respelled(
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
export function deindented(said: string): string {
  const [first, ...rest] = said.split('\n');
  if (first === undefined || rest.length === 0) return said;

  const indent = rest
    .filter((line) => line.trim() !== '')
    .map((line) => /^[ \t]*/.exec(line)?.[0].length ?? 0);
  const off = Math.min(...indent);

  return [first, ...rest.map((line) => line.slice(off))].join('\n');
}

/** One key of a mapping as the spec spells it, for a comparison against what it resolved to. */
export function spelt(node: Node & { kind: 'map' }, key: string): string | null {
  const held = entryOf(node, key)?.value;
  return held?.kind === 'scalar' ? String(held.value) : null;
}

/**
 * The band split into runs so the span stands alone, each piece keeping every
 * key the band had, with `changes` written over the span's own piece.
 */
export function splitBand(
  band: CompiledBand,
  span: Span,
  changes: readonly (readonly [string, string])[],
  read: Reading,
): { found: Found & { kind: 'found' }; ops: readonly Op[] } | null {
  const found = located(band.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const index = found.path[found.path.length - 1];
  const source = read.text(found.file);
  if (typeof index !== 'number' || source === null) return null;

  // Rewritten is the `at` as written: a `${...}` there would be written over
  // with whatever it resolved to.
  const over = { axis: span.axis, first: band.first, last: band.last };
  if (spelt(found.node, 'at') !== spelled(over)) return null;

  const pieces: string[] = [];
  for (const run of around(band, span)) {
    const own = run.first === span.first && run.last === span.last;
    const said = respelled(source, found.node, [
      ['at', spelled({ axis: span.axis, ...run })],
      ...(own ? changes : []),
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

  return { found, ops };
}

/** Whether the band is the only one under its key: taking it out takes the key, since a sequence cannot be empty. */
export function soleBand(found: Found & { kind: 'found' }, read: Reading): boolean {
  const tree = read.parsed(found.file);
  const under = tree?.root == null ? null : nodeAt(tree.root, found.path.slice(0, -1));

  return under?.kind === 'seq' && under.items.length === 1;
}
