import { type Span, span } from '@yxl-vscode/diag';
import { CODE } from './codes';
import { aboveComments, lineBreak, lineEnd, lineStart } from './lines';
import { formatPath, locate, type Site } from './locate';
import type { Mapping, Node, Sequence } from './node';
import type { Edit, Op, Path, Refuse } from './op';
import { renderScalar } from './write';

/**
 * A construct written into a sequence, on lines of its own.
 *
 * The lines arrive as the caller spelled them and are indented into place here,
 * because where they land is this layer's business and what they say is not.
 */
export function insertedBlock(
  source: string,
  op: Extract<Op, { op: 'insertSource' }>,
  site: Site,
  refuse: Refuse,
): Edit | undefined {
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
  const written = `${item(op.source, prefix)}${lineBreak(source)}`;

  const append = op.index >= target.items.length;
  const at = append
    ? lineEnd(source, neighbour.span.end)
    : aboveComments(source, lineStart(source, neighbour.span.start));
  return { span: span(at, at), text: written };
}

/**
 * A key with a construct under it, where the key is not there yet.
 *
 * Written at the end of the mapping, because a key that was never there has no
 * place it belongs, and the end is where a reader looks for what was added.
 */
export function addedBlock(
  source: string,
  op: Extract<Op, { op: 'addSource' }>,
  site: Site,
  refuse: Refuse,
): Edit | undefined {
  const target = site.node;
  if (target.kind !== 'map') {
    refuse(CODE.notAMapping, `\`${formatPath(op.path)}\` is not a mapping`, target.span);
    return undefined;
  }
  if (target.flow) {
    refuse(CODE.flowNotSupported, insideFlow(op.path), target.span);
    return undefined;
  }
  if (target.entries.some((entry) => entry.key.value === op.key)) {
    refuse(CODE.keyExists, `\`${op.key}\` is already there`, target.span);
    return undefined;
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

  const prefix = source.slice(lineStart(source, last.span.start), last.span.start);
  const step = stepOf(source);
  const break_ = lineBreak(source);
  const written = `${prefix}${renderScalar(op.key)}:${break_}${item(op.source, `${prefix}${step}`)}${break_}`;

  const at = lineEnd(source, last.span.end);
  return { span: span(at, at), text: written };
}

/** Lines as they go into the file: the first where it lands, the rest under it. */
function item(source: string, prefix: string): string {
  const [first, ...rest] = source.split('\n');
  const under = prefix.endsWith('- ') ? `${prefix.slice(0, -2)}  ` : prefix;

  return [`${prefix}${first ?? ''}`, ...rest.map((line) => `${under}${line}`)].join('\n');
}

/**
 * How far this file indents one level.
 *
 * Read off the file rather than assumed, because a spec written with four
 * spaces is not one this editor should start writing two into. Two where there
 * is nothing to read it from, which is what every example uses.
 */
function stepOf(source: string): string {
  const nested = /\n( +)\S/.exec(source);
  return nested?.[1] ?? '  ';
}

/**
 * A new entry in a mapping, on a line of its own.
 *
 * `before` names the entry it goes above; without one it goes last. The layout
 * comes from an entry that is already there, for the same reason a sequence's
 * does — a mapping with none has nothing to copy and nothing to guess from.
 */
export function addition(
  source: string,
  op: Extract<Op, { op: 'add' }>,
  site: Site,
  refuse: Refuse,
): Edit | undefined {
  const target = site.node;
  if (target.kind !== 'map') {
    refuse(CODE.notAMapping, `\`${formatPath(op.path)}\` is not a mapping`, target.span);
    return undefined;
  }
  if (target.entries.some((entry) => entry.key.value === op.key)) {
    refuse(CODE.keyExists, `\`${op.key}\` is already there`, target.span);
    return undefined;
  }
  if (target.flow) return { span: target.span, text: withEntry(source, target, op) };

  const first = target.entries[0];
  if (!first) {
    refuse(
      CODE.emptyMapping,
      `\`${formatPath(op.path)}\` has no entry to take its layout from`,
      target.span,
    );
    return undefined;
  }

  const above =
    op.before === null ? undefined : target.entries.find((entry) => entry.key.value === op.before);
  if (op.before !== null && above === undefined) {
    refuse(CODE.noSuchKey, `nothing is keyed \`${op.before}\` here`, target.span);
    return undefined;
  }

  const prefix = source.slice(lineStart(source, first.span.start), first.span.start);
  const written = `${prefix}${renderScalar(op.key)}: ${renderScalar(op.value)}${lineBreak(source)}`;

  const last = target.entries[target.entries.length - 1];
  const at =
    above === undefined
      ? lineEnd(source, (last ?? first).span.end)
      : lineStart(source, above.span.start);
  return { span: span(at, at), text: written };
}

/** An entry taken out of the file, with the lines that belong to it. */
export function removal(source: string, path: Path, site: Site, refuse: Refuse): Edit | undefined {
  if (site.in === 'root') {
    refuse(CODE.cannotRemoveRoot, 'the document root cannot be removed', site.node.span);
    return undefined;
  }
  if (site.parent.flow) return { span: site.parent.span, text: withoutEntry(source, site) };
  if (site.in === 'map' && opensAnItem(source, site.entry.span.start)) {
    refuse(CODE.itemMarker, carriesTheDash(path), site.node.span);
    return undefined;
  }

  return { span: taken(source, site), text: '' };
}

/**
 * Whether this is the entry written on the `- ` line of a sequence item.
 *
 * Taking its line takes the dash with it and the rest of the mapping stops
 * being an item at all. Moving the dash down to the entry that follows is a
 * structural edit, not a removal.
 */
function opensAnItem(source: string, start: number): boolean {
  return source.slice(lineStart(source, start), start).trimEnd().endsWith('-');
}

type Held = Extract<Site, { in: 'map' } | { in: 'seq' }>;

/**
 * A flow mapping with an entry written into it, as text.
 *
 * `before` names the entry it goes above, as it does in the block form, and
 * without one it goes last. Everything but the entry and its separator is the
 * file's own bytes, so nothing else in the collection is reformatted.
 */
function withEntry(source: string, target: Mapping, op: Extract<Op, { op: 'add' }>): string {
  const whole = target.span;
  const written = `${renderScalar(op.key)}: ${renderScalar(op.value)}`;

  const above = target.entries.find((entry) => entry.key.value === op.before);
  if (above !== undefined) {
    return (
      source.slice(whole.start, above.span.start) +
      written +
      ', ' +
      source.slice(above.span.start, whole.end)
    );
  }

  const last = target.entries[target.entries.length - 1];
  if (last === undefined) {
    return `${source.slice(whole.start, whole.start + 1)} ${written} ${source.slice(whole.end - 1, whole.end)}`;
  }

  return (
    source.slice(whole.start, last.span.end) +
    ', ' +
    written +
    source.slice(last.span.end, whole.end)
  );
}

/**
 * A flow collection with one of its entries cut out, as text.
 *
 * `{ value: 0.085, format: "0.0%" }` is one line, so there are no lines to take
 * — what goes is the entry and one separator, and the rest of the collection is
 * the file's own bytes on either side of the cut. Which separator depends on
 * where the entry sits: the comma after it, or, for the last one, the comma
 * before.
 */
function withoutEntry(source: string, site: Held): string {
  const whole = site.parent.span;
  const own = site.in === 'map' ? site.entry.span : site.node.span;

  const after = /^\s*,\s*/.exec(source.slice(own.end, whole.end - 1));
  if (after !== null) {
    return (
      source.slice(whole.start, own.start) + source.slice(own.end + after[0].length, whole.end)
    );
  }

  const before = /,\s*$/.exec(source.slice(whole.start + 1, own.start));
  if (before !== null) {
    return (
      source.slice(whole.start, own.start - before[0].length) + source.slice(own.end, whole.end)
    );
  }

  // The only one in it: what is left is the collection's own brackets, and
  // whether an empty one means anything is the compiler's question, not this
  // layer's.
  return source[whole.start] === '[' ? '[]' : '{}';
}

/**
 * The text a removal covers.
 *
 * More than the entry's own lines: a comment block directly above an entry
 * introduces it, and leaving it behind orphans it onto whatever follows. A
 * blank line under the entry goes too, where one separates it from the next —
 * otherwise removing an entry leaves the gap that used to be around it.
 */
function taken(source: string, site: Held): Span {
  const own = site.in === 'map' ? site.entry.span : site.node.span;
  const next = siblingsOf(site)[site.index + 1];

  const start = aboveComments(source, lineStart(source, own.start));

  // A block scalar's body ends where the next line begins, and asking for the
  // end of *that* line would take the entry after it as well.
  const end = source[own.end - 1] === '\n' ? own.end : lineEnd(source, own.end);
  if (next === undefined) return span(start, end);

  return span(start, blankLines(source, end, lineStart(source, next.span.start)));
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
 * An entry with lines of its own goes back above the entry that followed it, or
 * last where none did, and `inexact` is the reason it could *not* go back byte
 * for byte — `null` where it can. Both reasons are about lines that stay
 * behind: a blank line no anchor can be expressed across, and an entry with no
 * sibling left to be put back beside. A caller that will not make an edit it
 * cannot undo refuses on it (ADR-026).
 *
 * Inside a flow collection there are no lines to put back, so what is kept is
 * the collection's own text, to be written over it again.
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

/**
 * What a `remove` at this path would take out, read before the removal — the
 * only moment the text is still there.
 */
export function removalOf(source: string, root: Node, path: Path): Removal | null {
  const site = locate(root, path);
  if (site === undefined || site.in === 'root') return null;

  // Nothing in a flow collection has lines of its own, so what puts it back is
  // the collection's own text, written over whatever the removal leaves.
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

/**
 * Lines put back exactly as they were taken out.
 *
 * The text is not re-indented or re-rendered on the way in: it came out of this
 * file, and an undo that reformatted what it puts back would be an edit of its
 * own. Where it lands is named the way a removal saw it — above the entry that
 * followed, or last where nothing did.
 */
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

  if (target.entries.some((entry) => entry.key.value === op.key)) {
    refuse(CODE.keyExists, `\`${op.key}\` is already there`, target.span);
    return undefined;
  }

  const above = target.entries.find((entry) => entry.key.value === op.before);
  if (above !== undefined) return aboveComments(source, lineStart(source, above.span.start));
  if (op.before !== null) {
    refuse(CODE.noSuchKey, `nothing is keyed \`${op.before}\` here`, target.span);
    return undefined;
  }

  const last = target.entries[target.entries.length - 1];
  return last === undefined ? nothingLeft() : lineEnd(source, last.span.end);
}

export function insertion(
  source: string,
  op: Extract<Op, { op: 'insert' }>,
  site: Site,
  refuse: Refuse,
): Edit | undefined {
  const target = site.node;
  if (target.kind !== 'seq') {
    refuse(CODE.notASequence, `\`${formatPath(op.path)}\` is not a sequence`, target.span);
    return undefined;
  }
  if (target.flow) {
    refuse(CODE.flowNotSupported, insideFlow(op.path), target.span);
    return undefined;
  }

  // The prefix of an existing item — its indentation and its `- ` — is the one
  // reliable source for how this sequence is laid out. An empty sequence has
  // none, so there is nothing to copy and nothing to guess from.
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
  const line = `${prefix}${renderScalar(op.value)}${lineBreak(source)}`;

  const append = op.index >= target.items.length;
  const at = append
    ? lineEnd(source, neighbour.span.end)
    : aboveComments(source, lineStart(source, neighbour.span.start));
  return { span: span(at, at), text: line };
}

function carriesTheDash(path: Path): string {
  return `\`${formatPath(path)}\` carries the \`- \` that opens its item, which this editor does not move`;
}

function insideFlow(path: Path): string {
  return `\`${formatPath(path)}\` is inside a flow collection, which this editor does not rewrite yet`;
}
