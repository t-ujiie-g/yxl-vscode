import type { Span } from '@yxl-vscode/diag';
import type { FilePath, NodeId } from '@yxl-vscode/units';

/**
 * What every node carries: a session-stable identity never written to a spec
 * (ADR-015), the file it was written in — per node, because of `$include` —
 * and where in it.
 */
export interface SpecNode {
  readonly id: NodeId;
  readonly file: FilePath;
  readonly span: Span;
}

/**
 * A construct that is valid yxl and not modeled here, kept whole under the
 * `key` it was written under so that opening a spec cannot damage it (ADR-011).
 */
export interface Opaque extends SpecNode {
  readonly key: string;
}

/**
 * A string holding a `${param}` placeholder, standing where a value would be
 * read (`docs/spec.md` §7). Substitution is the compiler's, and is recorded as
 * provenance rather than flattened away.
 */
export interface Template {
  readonly kind: 'template';
  readonly text: string;
}

/** A value that has been read, or the placeholder text standing in for one. */
export type Templated<T> = T | Template;
