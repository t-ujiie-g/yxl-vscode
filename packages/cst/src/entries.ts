import { type Span, span } from '@yxl-vscode/diag';
import { CODE } from './codes';
import { cutOf, itemAt, withEntry, withoutEntry } from './flow';
import { aboveComments, lineBreak, lineEnd, lineStart } from './lines';
import { entryOf, formatPath, holds, locate, nodeAt, type Site } from './locate';
import type { Mapping, Node, Sequence } from './node';
import type { Edit, Op, Path, Refuse } from './op';
import { renderScalar } from './write';

/** A construct written into a sequence on lines of its own, indented into place here. */
export function insertedBlock(
  source: string,
  op: Extract<Op, { op: 'insertSource' }>,
  site: Site,
  refuse: Refuse,
): Edit | undefined {
  const placed = intoSequence(source, op, site, refuse);
  if (placed === undefined) return undefined;

  const written = `${item(op.source, placed.prefix)}${lineBreak(source)}`;
  return { span: span(placed.at, placed.at), text: written };
}

/** A scalar written into a sequence as one item. */
export function insertion(
  source: string,
  op: Extract<Op, { op: 'insert' }>,
  site: Site,
  refuse: Refuse,
): Edit | undefined {
  const target = site.node;
  if (target.kind === 'seq' && target.flow) {
    return itemAt(target, op.index, renderScalar(op.value));
  }

  const placed = intoSequence(source, op, site, refuse);
  if (placed === undefined) return undefined;

  const written = `${placed.prefix}${renderScalar(op.value)}${lineBreak(source)}`;
  return { span: span(placed.at, placed.at), text: written };
}

/** Where an item goes into a block sequence, and the `- ` prefix it takes from a neighbour; an empty one has none. */
function intoSequence(
  source: string,
  op: { readonly path: Path; readonly index: number },
  site: Site,
  refuse: Refuse,
): { at: number; prefix: string } | undefined {
  const target = site.node;
  if (target.kind !== 'seq') {
    refuse(CODE.notASequence, `\`${formatPath(op.path)}\` is not a sequence`, target.span);
    return undefined;
  }
  if (target.flow) {
    refuse(CODE.flowNotSupported, insideFlow(op.path), target.span);
    return undefined;
  }

  const neighbour = target.items[Math.min(op.index, target.items.length - 1)];
  if (!neighbour) {
    refuse(
      CODE.emptySequence,
      `\`${formatPath(op.path)}\` has no item to take its layout from`,
      target.span,
    );
    return undefined;
  }

  const prefix = source.slice(lineStart(source, neighbour.span.start), neighbour.span.start);
  const append = op.index >= target.items.length;
  const at = append
    ? lineEnd(source, neighbour.span.end)
    : aboveComments(source, lineStart(source, neighbour.span.start));

  return { at, prefix };
}

/** A key with a construct under it, written at the end of the mapping. */
export function addedBlock(
  source: string,
  op: Extract<Op, { op: 'addSource' }>,
  site: Site,
  refuse: Refuse,
): Edit | undefined {
  const target = mappingFor(op, site, refuse);
  if (target === undefined) return undefined;
  if (target.flow) {
    // A flow mapping is one line, so only a source that is one line fits in it.
    if (op.source.includes('\n')) {
      refuse(CODE.flowNotSupported, insideFlow(op.path), target.span);
      return undefined;
    }
    return { span: target.span, text: withEntry(source, target, op.key, op.source, null) };
  }

  const last = target.entries[target.entries.length - 1];
  if (!last) {
    refuse(
      CODE.emptyMapping,
      `\`${formatPath(op.path)}\` has no entry to take its layout from`,
      target.span,
    );
    return undefined;
  }

  const prefix = indentOf(source, last.span.start);
  const step = stepOf(source);
  const break_ = lineBreak(source);
  // A flow collection of one line stays on the key's line, as a person writes
  // one; a block entry or a sequence item cannot, whatever its length.
  const flow = op.source.startsWith('{') || op.source.startsWith('[');
  const beside = flow && !op.source.includes('\n');
  const written = beside
    ? `${prefix}${renderScalar(op.key)}: ${op.source}${break_}`
    : `${prefix}${renderScalar(op.key)}:${break_}${item(op.source, `${prefix}${step}`)}${break_}`;

  const at = lineEnd(source, last.span.end);
  return { span: span(at, at), text: written };
}

/**
 * A new entry in a mapping, above the entry `before` names or last without one.
 * The layout comes from an entry already there; a mapping with none has nothing
 * to copy.
 */
export function addition(
  source: string,
  op: Extract<Op, { op: 'add' }>,
  site: Site,
  refuse: Refuse,
): Edit | undefined {
  const target = mappingFor(op, site, refuse);
  if (target === undefined) return undefined;
  if (target.flow) {
    return {
      span: target.span,
      text: withEntry(source, target, op.key, renderScalar(op.value), op.before),
    };
  }

  const first = target.entries[0];
  if (!first) {
    refuse(
      CODE.emptyMapping,
      `\`${formatPath(op.path)}\` has no entry to take its layout from`,
      target.span,
    );
    return undefined;
  }

  const above = op.before === null ? undefined : entryOf(target, op.before);
  if (op.before !== null && above === undefined) {
    refuse(CODE.noSuchKey, `nothing is keyed \`${op.before}\` here`, target.span);
    return undefined;
  }

  if (above !== undefined && opensAnItem(source, above.span.start)) {
    refuse(CODE.itemMarker, carriesTheDash([...op.path, op.before ?? '']), target.span);
    return undefined;
  }

  const last = target.entries[target.entries.length - 1];
  const beside = above ?? last ?? first;
  const prefix = indentOf(source, beside.span.start);
  const written = `${prefix}${renderScalar(op.key)}: ${renderScalar(op.value)}${lineBreak(source)}`;

  const at =
    above === undefined ? lineEnd(source, beside.span.end) : lineStart(source, beside.span.start);
  return { span: span(at, at), text: written };
}

/** The indent a line written beside this one takes: its own, an item's `- ` counted as the room it takes. */
function indentOf(source: string, start: number): string {
  const prefix = source.slice(lineStart(source, start), start);
  return prefix.endsWith('- ') ? `${prefix.slice(0, -2)}  ` : prefix;
}

/** The mapping a key goes into, refused where the site is not one or already has the key. */
function mappingFor(
  op: { readonly path: Path; readonly key: string },
  site: Site,
  refuse: Refuse,
): Mapping | undefined {
  const target = site.node;
  if (target.kind !== 'map') {
    refuse(CODE.notAMapping, `\`${formatPath(op.path)}\` is not a mapping`, target.span);
    return undefined;
  }
  if (holds(target, op.key)) {
    refuse(CODE.keyExists, `\`${op.key}\` is already there`, target.span);
    return undefined;
  }
  return target;
}

/** Lines as they go into the file: the first where it lands, the rest under it. */
function item(source: string, prefix: string): string {
  const [first, ...rest] = source.split('\n');
  const under = prefix.endsWith('- ') ? `${prefix.slice(0, -2)}  ` : prefix;

  return [`${prefix}${first ?? ''}`, ...rest.map((line) => `${under}${line}`)].join('\n');
}

/** How far this file indents one level, read off the file; two spaces where nothing says. */
function stepOf(source: string): string {
  const nested = /\n( +)\S/.exec(source);
  return nested?.[1] ?? '  ';
}

/** An entry taken out of the file, with the lines that belong to it. */
export function removal(source: string, path: Path, site: Site, refuse: Refuse): Edit | undefined {
  if (site.in === 'root') {
    refuse(CODE.cannotRemoveRoot, 'the document root cannot be removed', site.node.span);
    return undefined;
  }
  if (site.parent.flow) {
    // Narrowly where it has a neighbour, so two fields can go out of one row.
    const cut = cutOf(source, site);
    return cut === null
      ? { span: site.parent.span, text: withoutEntry(source, site) }
      : { span: cut, text: '' };
  }
  if (site.in === 'map' && opensAnItem(source, site.entry.span.start)) {
    refuse(CODE.itemMarker, carriesTheDash(path), site.node.span);
    return undefined;
  }

  return { span: taken(source, site), text: '' };
}

/** The entry on a sequence item's `- ` line: taking its line takes the dash. */
function opensAnItem(source: string, start: number): boolean {
  return source.slice(lineStart(source, start), start).trimEnd().endsWith('-');
}

type Held = Extract<Site, { in: 'map' } | { in: 'seq' }>;

/** The entry, the comments above it, and the gap under it — or above, where it is last. */
function taken(source: string, site: Held): Span {
  const own = site.in === 'map' ? site.entry.span : site.node.span;
  const next = siblingsOf(site)[site.index + 1];

  const start = aboveComments(source, lineStart(source, own.start));

  // A block scalar's body already ends at a line break; asking for the end of
  // *that* line would take the next entry too.
  const end = source[own.end - 1] === '\n' ? own.end : lineEnd(source, own.end);
  if (next !== undefined) {
    return span(start, blankLines(source, end, lineStart(source, next.span.start)));
  }

  const previous = siblingsOf(site)[site.index - 1];
  if (previous === undefined) return span(start, end);

  const after = lineEnd(source, previous.span.end);
  return span(blankLines(source, after, start) === start ? after : start, end);
}

function siblingsOf(site: Held): readonly { readonly span: Span }[] {
  return site.in === 'map' ? site.parent.entries : site.parent.items;
}

/** Past the blank lines starting at `from`, and no further than `limit`. */
function blankLines(source: string, from: number, limit: number): number {
  let at = from;
  while (at < limit) {
    const end = lineEnd(source, at);
    if (source.slice(at, end).trim() !== '') break;
    at = end;
  }
  return at;
}

/**
 * What a removal takes out, and what putting it back needs to know.
 *
 * An entry goes back above the entry that followed it, or last; `inexact` is
 * the reason it could *not* go back byte for byte, which a caller refuses on
 * (ADR-026). Inside a flow collection there are no lines, so what is kept is
 * the collection's own text.
 */
export type Removal =
  | {
      readonly of: 'entry';
      readonly span: Span;
      readonly key: string | number;
      readonly before: string | null;
      readonly inexact: string | null;
    }
  | {
      readonly of: 'flow';
      readonly span: Span;
      readonly path: Path;
      readonly source: string;
    };

/** What a `remove` at this path would take out, read while the text is still there. */
export function removalOf(source: string, root: Node, path: Path): Removal | null {
  const site = locate(root, path);
  if (site === undefined || site.in === 'root') return null;

  if (site.parent.flow) {
    return {
      of: 'flow',
      span: site.parent.span,
      path: path.slice(0, -1),
      source: source.slice(site.parent.span.start, site.parent.span.end),
    };
  }

  const siblings = siblingsOf(site);
  const next = siblings[site.index + 1];
  const previous = siblings[site.index - 1];
  const at = taken(source, site);
  const named = `\`${formatPath(path)}\``;

  const inexact = (): string | null => {
    if (next !== undefined) {
      const between = source.slice(at.end, lineStart(source, next.span.start)).split('\n');
      return between.slice(0, -1).some((line) => line.trim() === '')
        ? `${named} has a blank line under it that would not be where it was`
        : null;
    }
    if (previous === undefined) {
      return `${named} is the only entry here, and nothing would be left to put it back beside`;
    }

    return lineEnd(source, previous.span.end) === at.start
      ? null
      : `${named} has lines above it that would not be where they were`;
  };

  const followed = site.in === 'map' ? site.parent.entries[site.index + 1] : undefined;

  return {
    of: 'entry',
    span: at,
    key: site.in === 'map' ? String(site.entry.key.value) : site.index,
    before: followed === undefined ? null : String(followed.key.value),
    inexact: inexact(),
  };
}

/** Lines put back exactly as they were taken out, where the removal saw them. */
export function restoration(
  source: string,
  op: Extract<Op, { op: 'restore' }>,
  site: Site,
  refuse: Refuse,
): Edit | undefined {
  const target = site.node;
  if (target.kind === 'scalar') {
    refuse(CODE.notAMapping, `\`${formatPath(op.path)}\` holds no entries`, target.span);
    return undefined;
  }
  if (target.flow) {
    refuse(CODE.flowNotSupported, insideFlow(op.path), target.span);
    return undefined;
  }

  const at = whereItWas(source, target, op, refuse);
  return at === undefined ? undefined : { span: span(at, at), text: op.source };
}

function whereItWas(
  source: string,
  target: Mapping | Sequence,
  op: Extract<Op, { op: 'restore' }>,
  refuse: Refuse,
): number | undefined {
  const nothingLeft = (): undefined => {
    const code = target.kind === 'map' ? CODE.emptyMapping : CODE.emptySequence;
    refuse(code, `\`${formatPath(op.path)}\` has nothing left to put it back beside`, target.span);
    return undefined;
  };

  if (target.kind === 'seq') {
    const above = target.items[Number(op.key)];
    if (above !== undefined) return aboveComments(source, lineStart(source, above.span.start));

    const last = target.items[target.items.length - 1];
    return last === undefined ? nothingLeft() : lineEnd(source, last.span.end);
  }

  if (holds(target, String(op.key))) {
    refuse(CODE.keyExists, `\`${op.key}\` is already there`, target.span);
    return undefined;
  }

  const above = entryOf(target, op.before ?? '');
  if (above !== undefined) return aboveComments(source, lineStart(source, above.span.start));
  if (op.before !== null) {
    refuse(CODE.noSuchKey, `nothing is keyed \`${op.before}\` here`, target.span);
    return undefined;
  }

  const last = target.entries[target.entries.length - 1];
  return last === undefined ? nothingLeft() : lineEnd(source, last.span.end);
}

function carriesTheDash(path: Path): string {
  return `\`${formatPath(path)}\` carries the \`- \` that opens its item, which this editor does not move`;
}

function insideFlow(path: Path): string {
  return `\`${formatPath(path)}\` is inside a flow collection, which this editor does not rewrite yet`;
}

/**
 * A block sequence's items written in a new order, as the text a `write` over
 * the sequence replaces it with; `order` holds the items' own indices. An item
 * carries its comments, and the blank lines between items stay where they are.
 */
export function reordered(
  source: string,
  root: Node,
  path: Path,
  order: readonly number[],
): string | null {
  const node = nodeAt(root, path);
  if (node === null || node.kind !== 'seq' || node.flow) return null;

  const items = node.items;
  if (order.length !== items.length) return null;
  if (new Set(order).size !== order.length) return null;
  if (order.some((one) => items[one] === undefined)) return null;

  const bodies: string[] = [];
  const gaps: string[] = [];

  for (const [index, item] of items.entries()) {
    const from = index === 0 ? lineStart(source, node.span.start) : above(source, item.span.start);
    const next = items[index + 1];
    const to = next === undefined ? node.span.end : above(source, next.span.start);

    const text = source.slice(from, to);
    const body = text.replace(/(?<=\n)(?:[ \t]*\n)*$/, '');
    bodies.push(body.endsWith('\n') ? body : `${body}\n`);
    gaps.push(text.slice(body.length));
  }

  const said = order.map((one, at) => `${bodies[one] ?? ''}${gaps[at] ?? ''}`).join('');
  const column = node.span.start - lineStart(source, node.span.start);

  return said.slice(column).replace(/\n$/, '');
}

/** Where an item's own text begins: the line it opens on, and the comments above it. */
function above(source: string, start: number): number {
  return aboveComments(source, lineStart(source, start));
}
