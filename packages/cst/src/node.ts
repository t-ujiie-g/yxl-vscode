import type { Diagnostic, Span } from '@yxl-vscode/diag';

/**
 * How a scalar was written. Preserved because it is meaning, not decoration:
 * `007` plain is a number and `"007"` quoted is the text a spec wanted, and a
 * write-back that changes the style changes the compiled workbook.
 */
export type ScalarStyle = 'plain' | 'single' | 'double' | 'literal' | 'folded';

/**
 * A YAML document as this project reads it: the shape a spec can take, with a
 * span on every node and nothing of the parser library showing through.
 *
 * Scalars carry both the resolved `value` and the `source` it was written as, so
 * a consumer that needs the exact text (a large integer, a number whose
 * precision matters) never has to reach back into the file for it.
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

/**
 * `flow` distinguishes `{ bold: true }` from the indented block form. It is not
 * decoration: a block edit inserts a line and a flow edit inserts inside
 * brackets, so a writer that cannot tell them apart will corrupt one of them.
 */
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

/**
 * The result of reading one file.
 *
 * `root` is null for an empty document, and may also be present alongside
 * errors — the parser recovers, and a partly-understood document still projects
 * something worth showing.
 */
export interface Parsed {
  readonly root: Node | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly source: string;
  readonly file: string;
}

export function isScalar(node: Node): node is Scalar {
  return node.kind === 'scalar';
}

export function isMapping(node: Node): node is Mapping {
  return node.kind === 'map';
}

export function isSequence(node: Node): node is Sequence {
  return node.kind === 'seq';
}
