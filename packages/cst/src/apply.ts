import { error, span } from '@yxl-vscode/diag';
import { CODE } from './codes';
import { addedBlock, addition, insertedBlock, insertion, removal, restoration } from './entries';
import { lineBreak, lineEnd } from './lines';
import { formatPath, locate, type Site } from './locate';
import type { Node } from './node';
import type { Applied, Edit, Op, Path, Refuse } from './op';
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

function blockScalar(path: Path): string {
  return `\`${formatPath(path)}\` is a block scalar, which this editor does not empty`;
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
