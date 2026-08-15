import { error, type Span, span } from '@yxl-vscode/diag';
import { CODE, type Code } from './codes';
import { aboveComments, lineBreak, lineEnd, lineStart } from './lines';
import { formatPath, locate, type Site } from './locate';
import type { Node } from './node';
import type { Applied, Edit, Op, Path } from './op';
import { parse } from './parse';
import { renderScalar } from './write';

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
      if (block(site.node)) {
        refuse(CODE.blockScalarNotSupported, blockScalar(op.path), site.node.span);
        return undefined;
      }

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
  }
}

/**
 * A new entry in a mapping, on a line of its own.
 *
 * `before` names the entry it goes above, which is how a removed entry finds
 * its way back to where it was; without one it goes last. The layout comes from
 * an entry that is already there, for the same reason a sequence's does — a
 * mapping with none has nothing to copy and nothing to guess from.
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

/**
 * Removing takes the whole line, indentation and line break included, so the
 * file is left with no blank gap where the entry was.
 */
function removal(source: string, path: Path, site: Site, refuse: Refuse): Edit | undefined {
  if (site.in === 'root') {
    refuse(CODE.cannotRemoveRoot, 'the document root cannot be removed', site.node.span);
    return undefined;
  }
  if (site.parent.flow) {
    refuse(CODE.flowNotSupported, insideFlow(path), site.node.span);
    return undefined;
  }

  const from = site.in === 'map' ? site.entry.span : site.node.span;
  return { span: span(lineStart(source, from.start), lineEnd(source, from.end)), text: '' };
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
 *
 * Writing a plain scalar over that body would take the following lines with it,
 * so the whole style is refused until there is a phase that rewrites one
 * properly — with its own indicator, indentation, and chomping kept.
 */
function block(node: Node): boolean {
  return node.kind === 'scalar' && (node.style === 'literal' || node.style === 'folded');
}

function blockScalar(path: Path): string {
  return `\`${formatPath(path)}\` is a block scalar, which this editor does not rewrite yet`;
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
