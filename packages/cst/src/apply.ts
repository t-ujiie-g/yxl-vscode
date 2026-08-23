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
 * Apply ops to YAML source, changing only the bytes the ops reach (ADR-017).
 * An op that cannot be applied is refused with a diagnostic; the rest still
 * apply.
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
        // `key: >-` with no body and `key:` with no value are different files,
        // and nothing has needed either yet.
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

/** `a:APAC` is one token, so a value written onto a bare `key:` needs a space first. */
function separatingSpace(source: string, node: Node): string {
  const empty = node.span.start === node.span.end;
  return empty && source[node.span.start - 1] === ':' ? ' ' : '';
}

/** A `|` or `>` scalar, whose span is its indented body. */
function block(node: Node): boolean {
  return node.kind === 'scalar' && (node.style === 'literal' || node.style === 'folded');
}

/** A value into a block scalar's body, as text at the body's indent: a shallower line closes the block. */
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

/** Back to front, so earlier offsets stay valid; overlapping edits are refused, not resolved. */
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
