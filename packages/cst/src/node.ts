import type { Diagnostic, Span } from '@yxl-vscode/diag';

/** How a scalar was written. Meaning, not decoration: `007` is a number and `"007"` is text. */
export type ScalarStyle = 'plain' | 'single' | 'double' | 'literal' | 'folded';

/**
 * A YAML document as this project reads it, with a span on every node and
 * nothing of the parser library showing through. A scalar carries the `source`
 * bytes it was written as beside its `value`; `flow` is `{ a: 1 }`, not a block.
 */
export type Node = Scalar | Mapping | Sequence;

export interface Scalar {
  readonly kind: 'scalar';
  readonly value: string | number | boolean | null;
  readonly source: string;
  readonly style: ScalarStyle;
  readonly span: Span;
}

export interface Entry {
  readonly key: Scalar;
  readonly value: Node;
  readonly span: Span;
}

export interface Mapping {
  readonly kind: 'map';
  readonly entries: readonly Entry[];
  readonly flow: boolean;
  readonly span: Span;
}

export interface Sequence {
  readonly kind: 'seq';
  readonly items: readonly Node[];
  readonly flow: boolean;
  readonly span: Span;
}

/** One file read. `root` is null for an empty document, and may sit beside errors: the parser recovers. */
export interface Parsed {
  readonly root: Node | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly source: string;
  readonly file: string;
}
