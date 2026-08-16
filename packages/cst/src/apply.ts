import { error, type Span, span } from '@yxl-vscode/diag';
import { CODE, type Code } from './codes';
import { aboveComments, lineBreak, lineEnd, lineStart } from './lines';
import { formatPath, locate, type Site } from './locate';
import type { Mapping, Node, Sequence } from './node';
import type { Applied, Edit, Op, Path } from './op';
import { parse } from './parse';
import { renderScalar, type Value } from './write';

/**
 * Apply ops to YAML source, changing only the bytes the ops reach.
 *
 * Nothing is re-serialized. Each op becomes a replacement of one range, and the
 * text between the ranges is the original file — so comments, key order,
 * quoting style, blank lines, and indentation survive because they are never
 * rewritten in the first place, rather than because a printer was careful.
 *
 * An op that cannot be applied is refused with a diagnostic and changes
 * nothing; the rest still apply.
 */
export function apply(source: string, ops: readonly Op[], options: { file: string }): Applied {
  const { root, diagnostics: parseErrors } = parse(source, options);
  const diagnostics = [...parseErrors];
  const edits: Edit[] = [];

  const refuse: Refuse = (code, message, at) => {
    diagnostics.push(error(code, message, { file: options.file, span: at }));
  };

  for (const op of ops) {
    const site = root ? locate(root, op.path) : undefined;
    if (!site) {
      refuse(CODE.noSuchPath, `nothing at \`${formatPath(op.path)}\``, span(0, 0));
      continue;
    }
    const edit = editFor(source, op, site, refuse);
    if (edit) edits.push(edit);
  }

  return { text: splice(source, edits, refuse), edits, diagnostics };
}

type Refuse = (code: Code, message: string, at: Span) => void;

function editFor(source: string, op: Op, site: Site, refuse: Refuse): Edit | undefined {
  switch (op.op) {
    case 'set': {
      if (block(site.node)) return intoBlock(source, op.value, site.node, refuse);

      const written = renderScalar(op.value, styleOf(site.node));
      return { span: site.node.span, text: `${separatingSpace(source, site.node)}${written}` };
    }

    case 'write':
      return { span: site.node.span, text: `${separatingSpace(source, site.node)}${op.source}` };

    case 'renameKey': {
      if (site.in !== 'map') {
        refuse(CODE.notAKey, `\`${formatPath(op.path)}\` is not a mapping entry`, site.node.span);
        return undefined;
      }
      return { span: site.entry.key.span, text: renderScalar(op.to, site.entry.key.style) };
    }

    case 'clear': {
      if (block(site.node)) {
        // Emptying one means deciding what is left — `key: >-` with nothing
        // under it, or the key with no value at all — and nothing has needed
        // the answer yet.
        refuse(CODE.blockScalarNotSupported, blockScalar(op.path), site.node.span);
        return undefined;
      }

      const from = site.node.span.start;
      const back = source[from - 1] === ' ' ? from - 1 : from;
      return { span: span(back, site.node.span.end), text: '' };
    }

    case 'remove':
      return removal(source, op.path, site, refuse);

    case 'insert':
      return insertion(source, op, site, refuse);

    case 'add':
      return addition(source, op, site, refuse);

    case 'insertSource':
      return insertedBlock(source, op, site, refuse);

    case 'addSource':
      return addedBlock(source, op, site, refuse);

    case 'restore':
      return restoration(source, op, site, refuse);
  }
}

/**
 * A construct written into a sequence, on lines of its own.
 *
 * The lines arrive as the caller spelled them and are indented into place here,
 * because where they land is this layer's business and what they say is not.
 */
function insertedBlock(
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
function addedBlock(
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
function addition(
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
  if (target.flow) {
    refuse(CODE.flowNotSupported, insideFlow(op.path), target.span);
    return undefined;
  }
  if (target.entries.some((entry) => entry.key.value === op.key)) {
    refuse(CODE.keyExists, `\`${op.key}\` is already there`, target.span);
    return undefined;
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

function styleOf(node: Node) {
  return node.kind === 'scalar' ? node.style : undefined;
}

/**
 * A value written where there was none sits directly against the `:` that
 * precedes it, and `a:APAC` is one token, not a pair. Anywhere else the space
 * is already in the file and must not be doubled.
 */
function separatingSpace(source: string, node: Node): string {
  const empty = node.span.start === node.span.end;
  return empty && source[node.span.start - 1] === ':' ? ' ' : '';
}

/** An entry taken out of the file, with the lines that belong to it. */
function removal(source: string, path: Path, site: Site, refuse: Refuse): Edit | undefined {
  if (site.in === 'root') {
    refuse(CODE.cannotRemoveRoot, 'the document root cannot be removed', site.node.span);
    return undefined;
  }
  if (site.parent.flow) {
    refuse(CODE.flowNotSupported, insideFlow(path), site.node.span);
    return undefined;
  }
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

/** What a removal takes out, and what putting it back would need to know. */
export interface Removal {
  readonly span: Span;
  readonly key: string | number;
  readonly before: string | null;
  readonly inexact: string | null;
}

/**
 * What a `remove` at this path would take out, and where a `restore` puts it
 * back — read before the removal, which is the only moment the text is there.
 *
 * `inexact` is the reason it could *not* be put back byte for byte, which a
 * caller that will not make an edit it cannot undo refuses on (ADR-026). Both
 * cases are about lines that stay behind: a blank line the anchor cannot be
 * expressed across, and an entry with no sibling left to be put back beside.
 */
export function removalOf(source: string, root: Node, path: Path): Removal | null {
  const site = locate(root, path);
  if (site === undefined || site.in === 'root') return null;

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
function restoration(
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

function insertion(
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

/**
 * A `|` or `>` scalar, whose span is its indented body rather than a value on
 * the line.
 */
function block(node: Node): boolean {
  return node.kind === 'scalar' && (node.style === 'literal' || node.style === 'folded');
}

/**
 * A new value into a block scalar, keeping the block.
 *
 * The span is the body alone: the `|` or `>-` that opens it, and the chomping
 * that ends it, sit outside it and are never touched. What is rewritten is the
 * text under the header, indented to where the body already sits — a line that
 * came back shallower would close the block early and take the rest of the
 * mapping with it.
 *
 * The value is written as text rather than rendered: quoting a scalar inside a
 * block would put the quotes *in* the string, which is the one thing a block
 * scalar exists to avoid.
 */
function intoBlock(source: string, value: Value, node: Node, refuse: Refuse): Edit | undefined {
  const body = lineEnd(source, node.span.start);
  const indent = /^[ \t]*/.exec(source.slice(body, lineEnd(source, body)))?.[0] ?? '';

  if (body >= node.span.end || indent === '') {
    refuse(
      CODE.emptyBlockScalar,
      'this block scalar has no body to take its layout from',
      node.span,
    );
    return undefined;
  }

  const written = value === null ? '' : String(value);
  const line = lineBreak(source);
  const lines = written.split('\n').map((one) => `${indent}${one}`);

  return { span: span(body, node.span.end), text: `${lines.join(line)}${line}` };
}

function carriesTheDash(path: Path): string {
  return `\`${formatPath(path)}\` carries the \`- \` that opens its item, which this editor does not move`;
}

function blockScalar(path: Path): string {
  return `\`${formatPath(path)}\` is a block scalar, which this editor does not empty`;
}

function insideFlow(path: Path): string {
  return `\`${formatPath(path)}\` is inside a flow collection, which this editor does not rewrite yet`;
}

/**
 * Apply the edits back to front, so an earlier edit's offsets are still valid
 * when it is its turn. Overlapping edits are refused rather than resolved —
 * two ops fighting over the same bytes is a caller mistake, and picking a
 * winner would hide it.
 */
function splice(source: string, edits: readonly Edit[], refuse: Refuse): string {
  const ordered = [...edits].sort((a, b) => b.span.start - a.span.start);
  let text = source;
  let previousStart = Number.POSITIVE_INFINITY;

  for (const edit of ordered) {
    if (edit.span.end > previousStart) {
      refuse(CODE.overlappingEdits, 'two edits cover the same text', edit.span);
      continue;
    }
    text = text.slice(0, edit.span.start) + edit.text + text.slice(edit.span.end);
    previousStart = edit.span.start;
  }

  return text;
}
