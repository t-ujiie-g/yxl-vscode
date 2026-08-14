import type { Entry, Node, Path } from '@yxl-vscode/cst';
import { type Diagnostic, error, type Span } from '@yxl-vscode/diag';
import type { SpecNode } from '@yxl-vscode/spec';
import type { FilePath } from '@yxl-vscode/units';
import type { Code } from './codes';
import { nodeIdAt } from './id';

/**
 * A file an `$include` names, opened.
 *
 * `file` is the name the reader resolved it to, not the text the spec wrote:
 * every node read out of it carries that name, and a diagnostic has to point at
 * a file a person can open.
 */
export interface Included {
  readonly file: FilePath;
  readonly source: string;
}

/**
 * How the core reaches another file without knowing what a file is (ADR-004).
 *
 * A path resolves against the file the include was written in — a spec
 * directory moves as a unit (`docs/spec.md` §8) — which is the shell's to do,
 * along with deciding that a path is unreachable and returning `null`.
 */
export type IncludeReader = (from: FilePath, path: FilePath) => Included | null;

/**
 * What every reader is given: the file it is reading, somewhere to put what it
 * could not read, and the way out to another file.
 *
 * A reader reports and carries on. A spec being edited is wrong most of the
 * time — half a key is typed, a range is momentarily backwards — and a reader
 * that stopped at the first of those would blank the grid on every keystroke.
 *
 * `chain` is the files that were followed to get here, the current one last, so
 * an include that comes back round can say so and name the loop.
 */
export interface Ctx {
  readonly file: FilePath;
  readonly diagnostics: Diagnostic[];
  readonly include: IncludeReader | null;
  readonly chain: readonly FilePath[];
}

/**
 * Where a reader is: a node, the file it was written in, and the path that
 * reaches it *within that file*.
 *
 * The path restarts at the root of each included file, because that is what an
 * edit to one of its nodes has to address.
 */
export interface Site<T extends Node = Node> {
  readonly ctx: Ctx;
  readonly node: T;
  readonly path: Path;
}

export function reject(ctx: Ctx, code: Code, message: string, at: Span): void {
  ctx.diagnostics.push(error(code, message, { file: ctx.file, span: at }));
}

/** The identity, file, and span every node of the AST carries. */
export function nodeAt(ctx: Ctx, path: Path, at: Span): SpecNode {
  return { id: nodeIdAt(ctx.file, path), file: ctx.file, span: at };
}

export function keyOf(entry: Entry): string {
  return typeof entry.key.value === 'string' ? entry.key.value : String(entry.key.value);
}
