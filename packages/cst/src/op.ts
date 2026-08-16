import type { Diagnostic, Span } from '@yxl-vscode/diag';
import type { Code } from './codes';
import type { Value } from './write';

/** Steps from the document root: a key in a mapping, an index in a sequence. */
export type Path = readonly (string | number)[];

/**
 * An edit expressed against the tree rather than against the text.
 *
 * These are deliberately fewer than the spec-level operations `patch` will
 * take — that algebra addresses spec constructs; this one addresses YAML nodes
 * and is all the syntax layer needs to be asked for.
 *
 * They come in pairs, because an edit that cannot be undone is one this editor
 * will not make (ADR-010): `set` against `write` or `clear`, `insert` and `add`
 * against `remove`, `remove` against `restore`, `renameKey` against itself.
 * `add` names the key it goes *before* rather than an index, so an entry put
 * back lands where it was.
 *
 * `write` and `restore` put back the *text* that was there, where `set` and
 * `add` write a value and let the renderer choose how. That difference is what
 * makes an undo byte-exact: a tab written raw inside quotes, or a number
 * written `1.50`, is the same value and not the same file — and an entry
 * holding a whole mapping has no value to write at all (ADR-027).
 */
export type Op =
  | { readonly op: 'set'; readonly path: Path; readonly value: Value }
  | { readonly op: 'write'; readonly path: Path; readonly source: string }
  | { readonly op: 'clear'; readonly path: Path }
  | { readonly op: 'renameKey'; readonly path: Path; readonly to: string }
  | { readonly op: 'remove'; readonly path: Path }
  | { readonly op: 'insert'; readonly path: Path; readonly index: number; readonly value: Value }
  | {
      readonly op: 'add';
      readonly path: Path;
      readonly key: string;
      readonly value: Value;
      readonly before: string | null;
    }
  | {
      readonly op: 'insertSource';
      readonly path: Path;
      readonly index: number;
      readonly source: string;
    }
  | {
      readonly op: 'addSource';
      readonly path: Path;
      readonly key: string;
      readonly source: string;
    }
  | {
      readonly op: 'restore';
      readonly path: Path;
      readonly key: string | number;
      readonly before: string | null;
      readonly source: string;
    };

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

/**
 * How an op says it cannot be applied: a code, a sentence, and where in the
 * file the reader should be looking.
 */
export type Refuse = (code: Code, message: string, at: Span) => void;
