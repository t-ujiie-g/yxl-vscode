import type { Span } from '@yxl-vscode/diag';
import type { FilePath, NodeId } from '@yxl-vscode/units';

/**
 * What every node of this AST carries: an identity that is stable for as long
 * as the session and is never written to a spec (ADR-015), the file it was
 * written in — which `$include` makes a per-node fact rather than a document
 * one — and where in that file's source it sits.
 */
export interface SpecNode {
  readonly id: NodeId;
  readonly file: FilePath;
  readonly span: Span;
}

/**
 * A construct that is valid yxl and not modeled here, kept so that opening a
 * spec cannot damage it (ADR-011).
 *
 * `key` is the mapping key it was written under, and the span covers the whole
 * entry — enough to show it in the grid as something this editor will not
 * touch, and enough to leave every byte of it alone when the file is written
 * back.
 */
export interface Opaque extends SpecNode {
  readonly key: string;
}

/**
 * A string the spec wrote that holds a `${param}` placeholder, standing where
 * this AST would otherwise have read a value (`docs/spec.md` §7).
 *
 * Substitution is the compiler's, not the loader's: it is recorded as `param`
 * provenance rather than flattened away, which is what lets a cell say it came
 * from a parameter and lets an edit reach the parameter instead of the cell.
 */
export interface Template {
  readonly kind: 'template';
  readonly text: string;
}

/**
 * A value that has been read, or the placeholder text standing in for one.
 *
 * Only the parsed vocabulary — addresses, ranges, band selectors, names,
 * colours, paths — is wrapped this way. A field that is already plain text
 * needs no wrapper: a placeholder inside it is text until it is substituted.
 */
export type Templated<T> = T | Template;
