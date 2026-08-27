import type { Diagnostic, Span } from '@yxl-vscode/diag';
import type { Code } from './codes';
import type { Value } from './write';

/** Steps from the document root: a key in a mapping, an index in a sequence. */
export type Path = readonly (string | number)[];

/**
 * An edit against the YAML tree; they come in pairs. `write` and `restore`
 * put back *text*, which is what makes an undo
 * byte-exact (ADR-026, ADR-027).
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

/** The file after the ops, the ranges that changed, and the ops that were refused. */
export interface Applied {
  readonly text: string;
  readonly edits: readonly Edit[];
  readonly diagnostics: readonly Diagnostic[];
}

/** How an op says it cannot be applied. */
export type Refuse = (code: Code, message: string, at: Span) => void;
