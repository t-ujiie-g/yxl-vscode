import { type CompiledBand, type CompiledSheet, sheetOf } from '@yxl-vscode/compile';
import { entryOf, holds, type Node, type Op } from '@yxl-vscode/cst';
import { type Axis, BAND_KEYS } from '@yxl-vscode/spec';
import { columnLabel, type SheetName } from '@yxl-vscode/units';
import { type Found, located, type Reading } from './direct';
import type { Candidate } from './resolve';
import type { Projection } from './writes';

/** A column dragged to a width in character units, or a row to a height in points. */
export interface Dragged {
  readonly sheet: SheetName;
  readonly axis: Axis;
  readonly at: number;
  readonly size: number;
}

/**
 * Every way of making a column that wide — `ROADMAP.md` §4.4's `setSize` table.
 * A size is a band, never forty cells, so a band that reaches past the one
 * dragged is a question rather than an answer.
 */
export function setSize(spec: Projection, dragged: Dragged, read: Reading): readonly Candidate[] {
  const sheet = sheetOf(spec.grid, dragged.sheet);
  if (sheet === null || dragged.at < 1 || dragged.size < 0) return [];

  const bands = dragged.axis === 'column' ? sheet.columns : sheet.rows;
  const over = bands.findLast((band) => sizes(band, dragged.at)) ?? null;

  if (over === null) {
    const own = ofItsOwn(sheet, dragged, read);
    return own === null ? [] : [{ ...own, alone: true }];
  }

  if (over.first === over.last) {
    const one = theBand(over, dragged, read);
    return one === null ? [] : [{ ...one, alone: true }];
  }

  return [theBand(over, dragged, read), apart(over, dragged, read)].filter(
    (one): one is Candidate => one !== null,
  );
}

/** Whether the band is what gives this column its width, which a band setting no width does not. */
function sizes(band: CompiledBand, at: number): boolean {
  return band.size !== null && band.first <= at && at <= band.last;
}

/** The answer that writes a band for this one column, where nothing sizes it yet. */
function ofItsOwn(sheet: CompiledSheet, dragged: Dragged, read: Reading): Candidate | null {
  const found = located(sheet.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const key = BAND_KEYS[dragged.axis].at;
  const body = `at: ${spelled(dragged.at, dragged.at, dragged.axis)}\n${BAND_KEYS[dragged.axis].size}: ${dragged.size}`;
  const held = entryOf(found.node, key)?.value;

  const op: Op =
    held?.kind === 'seq'
      ? { op: 'insertSource', path: [...found.path, key], index: held.items.length, source: body }
      : { op: 'addSource', path: found.path, key, source: `- ${body.replace('\n', '\n  ')}` };

  return answer('ofItsOwn', `Write a ${dragged.axis} of its own`, found, [op]);
}

/** The answer that changes the band the size comes from, every column of it included. */
function theBand(band: CompiledBand, dragged: Dragged, read: Reading): Candidate | null {
  const found = located(band.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const key = BAND_KEYS[dragged.axis].size;
  if (!holds(found.node, key)) return null;

  const many = band.last - band.first + 1;
  const what =
    many === 1
      ? `Change the band over \`${spelled(band.first, band.last, dragged.axis)}\``
      : `Change the band over \`${spelled(band.first, band.last, dragged.axis)}\`, which is ${many} ${dragged.axis}s`;

  return answer('band', what, found, [
    { op: 'set', path: [...found.path, key], value: dragged.size },
  ]);
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
  if (spelt(found.node, 'at') !== spelled(band.first, band.last, dragged.axis)) return null;

  const pieces: string[] = [];
  for (const run of around(band, dragged.at)) {
    const at = spelled(run.first, run.last, dragged.axis);
    const own = run.first === dragged.at && run.last === dragged.at;
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

  const what = `Split it so \`${spelled(dragged.at, dragged.at, dragged.axis)}\` stands alone`;
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

/** The runs a band falls into once the one dragged is taken out of it. */
function around(band: CompiledBand, at: number): { first: number; last: number }[] {
  const runs = [{ first: at, last: at }];
  if (band.first < at) runs.unshift({ first: band.first, last: at - 1 });
  if (at < band.last) runs.push({ first: at + 1, last: band.last });

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

/** A span as a band's `at` spells it: a column label or a row number, and a range as two of them. */
function spelled(first: number, last: number, axis: Axis): string {
  const said = (at: number) => (axis === 'column' ? columnLabel(at) : String(at));
  return first === last ? said(first) : `${said(first)}-${said(last)}`;
}

/** One key of a mapping as the spec spells it, for a comparison against what it resolved to. */
function spelt(node: Node & { kind: 'map' }, key: string): string | null {
  const held = entryOf(node, key)?.value;
  return held?.kind === 'scalar' ? String(held.value) : null;
}
