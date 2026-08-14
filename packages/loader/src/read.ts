import type { Entry, Mapping, Node, Path, Sequence } from '@yxl-vscode/cst';
import { type Diagnostic, error, type Span } from '@yxl-vscode/diag';
import { INCLUDE_KEY, type ScalarValue, type SpecNode } from '@yxl-vscode/spec';
import type { FilePath } from '@yxl-vscode/units';
import { CODE, type Code } from './codes';
import { nodeIdAt } from './id';

/**
 * What every reader is given: the file it is reading, and somewhere to put what
 * it could not read.
 *
 * A reader reports and carries on. A spec being edited is wrong most of the
 * time — half a key is typed, a range is momentarily backwards — and a reader
 * that stopped at the first of those would blank the grid on every keystroke.
 */
export interface Ctx {
  readonly file: FilePath;
  readonly diagnostics: Diagnostic[];
}

export function reject(ctx: Ctx, code: Code, message: string, at: Span): void {
  ctx.diagnostics.push(error(code, message, { file: ctx.file, span: at }));
}

/** The identity, file, and span every node of the AST carries. */
export function nodeAt(ctx: Ctx, path: Path, at: Span): SpecNode {
  return { id: nodeIdAt(path), file: ctx.file, span: at };
}

/**
 * A mapping, or `null` with the reason reported.
 *
 * An `$include` is a mapping standing where another node should be. Until it is
 * expanded, saying so is more use than reading it as the construct it replaced
 * and reporting everything that construct is missing.
 */
export function expectMap(ctx: Ctx, node: Node, what: string): Mapping | null {
  if (isInclude(node)) {
    reject(ctx, CODE.includeNotExpanded, `${what} is an \`${INCLUDE_KEY}\``, node.span);
    return null;
  }
  if (node.kind !== 'map') {
    reject(ctx, CODE.notAMapping, `${what} must be a mapping`, node.span);
    return null;
  }
  return node;
}

/** A sequence, or `null` with the reason reported. */
export function expectSeq(ctx: Ctx, node: Node, what: string): Sequence | null {
  if (isInclude(node)) {
    reject(ctx, CODE.includeNotExpanded, `${what} is an \`${INCLUDE_KEY}\``, node.span);
    return null;
  }
  if (node.kind !== 'seq') {
    reject(ctx, CODE.notASequence, `${what} must be a sequence`, node.span);
    return null;
  }
  return node;
}

/** Text, or `null` with the reason reported. A number is not text. */
export function expectText(ctx: Ctx, node: Node, what: string): string | null {
  if (node.kind === 'scalar' && typeof node.value === 'string') return node.value;
  reject(ctx, CODE.notText, `${what} must be text`, node.span);
  return null;
}

export function expectBool(ctx: Ctx, node: Node, what: string): boolean | null {
  if (node.kind === 'scalar' && typeof node.value === 'boolean') return node.value;
  reject(ctx, CODE.notABoolean, `${what} must be true or false`, node.span);
  return null;
}

export function expectNumber(ctx: Ctx, node: Node, what: string): number | null {
  if (node.kind === 'scalar' && typeof node.value === 'number') return node.value;
  reject(ctx, CODE.notANumber, `${what} must be a number`, node.span);
  return null;
}

/**
 * A value a cell or a definition can hold.
 *
 * `null` is refused rather than read as a blank: a key written with nothing
 * after it is unfinished, and yxl refuses it too. Inline `data:` rows are the
 * one place a `null` means something, and they read their fields themselves.
 */
export function expectValue(ctx: Ctx, node: Node, what: string): ScalarValue | null {
  if (node.kind === 'scalar' && node.value !== null) return node.value;
  reject(ctx, CODE.notAValue, `${what} must be text, a number, or a boolean`, node.span);
  return null;
}

/**
 * A mapping's entries, in the order written and without a repeated key.
 *
 * A repeat is reported and dropped rather than layered, which is what yxl does
 * with one and what keeps two nodes from deriving the same identity.
 */
export function entriesOf(ctx: Ctx, map: Mapping): Entry[] {
  const seen = new Set<string>();
  const kept: Entry[] = [];

  for (const entry of map.entries) {
    const key = keyOf(entry);
    if (seen.has(key)) {
      reject(ctx, CODE.duplicateKey, `\`${key}\` is written twice; the first one wins`, entry.span);
      continue;
    }
    seen.add(key);
    kept.push(entry);
  }

  return kept;
}

/**
 * Report a key the construct does not have, naming the ones it does.
 *
 * The list comes from `MODELED_KEYS` rather than from the message, so what a
 * reader accepts and what it says it accepts cannot drift apart.
 */
export function rejectUnknownKey(
  ctx: Ctx,
  entry: Entry,
  what: string,
  known: ReadonlySet<string>,
): void {
  const expected = [...known].join(', ');
  const message = `unknown key \`${keyOf(entry)}\` in ${what} (expected ${expected})`;
  reject(ctx, CODE.unknownKey, message, entry.span);
}

/** One spelling out of a closed vocabulary, or `null` with the reason reported. */
export function expectSpelling<T extends string>(
  ctx: Ctx,
  node: Node,
  what: string,
  vocabulary: readonly T[],
): T | null {
  const text = expectText(ctx, node, what);
  if (text === null) return null;

  const spelling = vocabulary.find((known) => known === text);
  if (spelling !== undefined) return spelling;

  const message = `${what} must be one of ${vocabulary.join(', ')}: \`${text}\``;
  reject(ctx, CODE.unknownSpelling, message, node.span);
  return null;
}

export function keyOf(entry: Entry): string {
  return typeof entry.key.value === 'string' ? entry.key.value : String(entry.key.value);
}

export function findEntry(entries: readonly Entry[], key: string): Entry | undefined {
  return entries.find((entry) => keyOf(entry) === key);
}

/**
 * The text of a scalar that may have been written as a number — a row band's
 * `at: 1` is the row `"1"`, and a column's is a label.
 */
export function scalarText(node: Node): string | null {
  if (node.kind !== 'scalar') return null;
  if (typeof node.value === 'string') return node.value;
  if (typeof node.value === 'number') return String(node.value);
  return null;
}

function isInclude(node: Node): boolean {
  return node.kind === 'map' && node.entries.some((entry) => keyOf(entry) === INCLUDE_KEY);
}
