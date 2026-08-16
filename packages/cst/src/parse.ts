import { type Diagnostic, error, type Span, span, union } from '@yxl-vscode/diag';
import { CST, Parser } from 'yaml';
import { CODE, type Code } from './codes';
import type { Entry, Node, Parsed, Scalar, ScalarStyle, Sequence } from './node';
import { resolvePlain } from './scalar';

const STYLES: Record<string, ScalarStyle> = {
  scalar: 'plain',
  'single-quoted-scalar': 'single',
  'double-quoted-scalar': 'double',
};

/**
 * Read YAML source into a span-carrying tree.
 *
 * The parser recovers rather than stopping, so a document with errors still
 * yields whatever tree it could build — an editor has to draw something while
 * the user is mid-keystroke.
 */
export function parse(source: string, options: { file: string }): Parsed {
  const reader = new Reader(options.file, source);
  const documents = [...new Parser().parse(source)].filter((t) => t.type === 'document');

  const [first, ...rest] = documents;
  for (const extra of rest) {
    reader.reject(CODE.multipleDocuments, 'a spec holds one document; the rest are ignored', {
      start: extra.offset,
      end: extra.offset,
    });
  }

  const root = first?.value ? reader.node(first.value) : null;
  return { root, diagnostics: reader.diagnostics, source, file: options.file };
}

/**
 * Walks the parser library's tokens into our tree, collecting what it cannot
 * represent as diagnostics rather than throwing.
 */
class Reader {
  readonly diagnostics: Diagnostic[] = [];

  constructor(
    private readonly file: string,
    private readonly text: string,
  ) {}

  reject(code: Code, message: string, at: Span): void {
    this.diagnostics.push(error(code, message, { file: this.file, span: at }));
  }

  node(token: CST.Token): Node | null {
    switch (token.type) {
      case 'block-map':
        return this.mapping(token.items, token.offset, false);
      case 'block-seq':
        return this.sequence(token.items, token.offset, false);
      case 'flow-collection':
        return this.flow(token);
      case 'scalar':
      case 'single-quoted-scalar':
      case 'double-quoted-scalar':
      case 'block-scalar':
        return this.scalar(token);
      case 'alias':
        this.reject(
          CODE.alias,
          'YAML aliases are not supported; name the value in `defs:` and reference it',
          extent(token),
        );
        return null;
      default:
        this.reject(CODE.unexpectedToken, `unexpected ${token.type}`, extent(token));
        return null;
    }
  }

  scalar(token: CST.Token): Scalar | null {
    if (!CST.isScalar(token)) {
      this.reject(CODE.unexpectedToken, `expected a scalar, found ${token.type}`, extent(token));
      return null;
    }

    const resolved = CST.resolveAsScalar(token, false, () => {});
    const at = span(resolved.range[0], resolved.range[1]);
    const style = token.type === 'block-scalar' ? blockStyle(token) : STYLES[token.type];

    return {
      kind: 'scalar',
      value: style === 'plain' ? resolvePlain(resolved.value) : resolved.value,
      // The bytes, not the reading of them: `"a\tb"` written with a real tab
      // and written with an escape are one value and two files, and putting one
      // back where the other was is an edit nobody asked for.
      source: this.text.slice(at.start, at.end),
      style: style ?? 'plain',
      span: at,
    };
  }

  mapping(items: readonly CST.CollectionItem[], offset: number, flow: boolean): Node {
    const entries: Entry[] = [];

    for (const item of items) {
      if (!item.key) continue;

      const key = this.scalar(item.key);
      if (!key) continue;
      if (typeof key.value !== 'string') {
        this.reject(CODE.nonStringKey, 'a mapping key must be text', key.span);
        continue;
      }

      const value = item.value ? this.node(item.value) : null;
      const resolved = value ?? emptyAt(afterSeparator(item, key.span.end));
      entries.push({ key, value: resolved, span: union(key.span, resolved.span) });
    }

    return { kind: 'map', entries, flow, span: cover(offset, entries) };
  }

  sequence(items: readonly CST.CollectionItem[], offset: number, flow: boolean): Sequence {
    const collected: Node[] = [];

    for (const item of items) {
      if (!item.value) continue;
      const value = this.node(item.value);
      if (value) collected.push(value);
    }

    return { kind: 'seq', items: collected, flow, span: cover(offset, collected) };
  }

  /** `{a: 1}` and `[1, 2]` differ only by their opening token. */
  flow(token: CST.FlowCollection): Node {
    const node =
      token.start.source === '{'
        ? this.mapping(token.items, token.offset, true)
        : this.sequence(token.items, token.offset, true);

    // A collection's span stops at its last member, which here would leave the
    // bracket that closes it outside the node it closes — and a rewrite of the
    // collection would then write over the opening one and not the closing.
    const closed = token.end.find(
      (one) => one.type === 'flow-map-end' || one.type === 'flow-seq-end',
    );
    if (closed === undefined) return node;

    return { ...node, span: span(node.span.start, closed.offset + closed.source.length) };
  }
}

function blockStyle(token: CST.BlockScalar): ScalarStyle {
  return token.props.some((p) => p.type === 'block-scalar-header' && p.source.startsWith('>'))
    ? 'folded'
    : 'literal';
}

/**
 * A collection's span runs from its own offset to the end of its last member,
 * so it stops short of the trailing comments and blank lines that follow it.
 */
function cover(offset: number, members: readonly { span: Span }[]): Span {
  const last = members.at(-1);
  return span(offset, last ? last.span.end : offset);
}

/** A key written with no value — `sheets:` on its own line — reads as null. */
function emptyAt(offset: number): Scalar {
  return { kind: 'scalar', value: null, source: '', style: 'plain', span: span(offset, offset) };
}

/**
 * Where an absent value sits: immediately after the `:`, not after the key. An
 * empty span before the separator would put a written value on the wrong side
 * of it.
 *
 * `sep` runs on past the indicator through the whitespace and the line break,
 * so the indicator has to be picked out by type rather than taken as the last
 * token — otherwise the position lands on the next line.
 */
function afterSeparator(item: CST.CollectionItem, fallback: number): number {
  const indicator = item.sep?.find((token) => token.type === 'map-value-ind');
  return indicator ? indicator.offset + indicator.source.length : fallback;
}

function extent(token: CST.Token): Span {
  const offset = 'offset' in token ? token.offset : 0;
  return span(offset, offset + CST.stringify(token).length);
}
