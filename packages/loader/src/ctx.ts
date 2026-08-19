import type { Entry, Node, Path } from '@yxl-vscode/cst';
import { type Diagnostic, error, type Span } from '@yxl-vscode/diag';
import type { SpecNode } from '@yxl-vscode/spec';
import type { FilePath } from '@yxl-vscode/units';
import type { Code } from './codes';
import { nodeIdAt } from './id';

/** A file an `$include` names, opened; `file` is the resolved name, which every node read from it carries. */
export interface Included {
  readonly file: FilePath;
  readonly source: string;
}

/**
 * How the core reaches another file without knowing what a file is (ADR-004).
 * A path resolves against the file the include was written in (`docs/spec.md`
 * §8), which is the shell's to do.
 */
export type IncludeReader = (from: FilePath, path: FilePath) => Included | null;

/**
 * What every reader is given: the file it is reading, somewhere to put what it
 * could not read, and the way out to another file. `chain` is the files
 * followed to get here, so an include that comes back round can name the loop.
 */
export interface Ctx {
  readonly file: FilePath;
  readonly diagnostics: Diagnostic[];
  readonly include: IncludeReader | null;
  readonly chain: readonly FilePath[];
}

/** Where a reader is: a node, its file, and the path within that file — restarting at each include's root. */
export interface Site<T extends Node = Node> {
  readonly ctx: Ctx;
  readonly node: T;
  readonly path: Path;
}

export function reject(ctx: Ctx, code: Code, message: string, at: Span): void {
  ctx.diagnostics.push(error(code, message, { file: ctx.file, span: at }));
}

/** The identity, file, and span every node of the AST carries. */
export function identify(ctx: Ctx, path: Path, at: Span): SpecNode {
  return { id: nodeIdAt(ctx.file, path), file: ctx.file, span: at };
}

export function keyOf(entry: Entry): string {
  return typeof entry.key.value === 'string' ? entry.key.value : String(entry.key.value);
}
