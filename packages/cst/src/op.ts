import type { Diagnostic, Span } from '@yxl-vscode/diag';
import type { Value } from './write';

/** Steps from the document root: a key in a mapping, an index in a sequence. */
export type Path = readonly (string | number)[];

/**
 * An edit expressed against the tree rather than against the text.
 *
 * These are deliberately fewer than the spec-level operations `patch` will
 * take — that algebra addresses spec constructs; this one addresses YAML nodes
 * and is all the syntax layer needs to be asked for.
 */
export type Op =
  | { readonly op: 'set'; readonly path: Path; readonly value: Value }
  | { readonly op: 'renameKey'; readonly path: Path; readonly to: string }
  | { readonly op: 'remove'; readonly path: Path }
  | { readonly op: 'insert'; readonly path: Path; readonly index: number; readonly value: Value };

/** One replacement of a range of the source. The unit minimal patching is made of. */
export interface Edit {
  readonly span: Span;
  readonly text: string;
}

/**
 * The result of applying ops.
 *
 * `text` is the whole file after the edits, and `edits` is what was changed —
 * kept because a caller that wants to show a diff, or assert that only the
 * intended lines moved, should not have to re-derive it.
 *
 * An op that could not be applied leaves a diagnostic and changes nothing;
 * the other ops in the list still apply.
 */
export interface Applied {
  readonly text: string;
  readonly edits: readonly Edit[];
  readonly diagnostics: readonly Diagnostic[];
}
