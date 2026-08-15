import type { Entry, Mapping, Node, Path, Sequence } from '@yxl-vscode/cst';
import type { ScalarValue } from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, keyOf, reject, type Site } from './ctx';
import { follow } from './include';

/**
 * A mapping, wherever it turned out to be, or `null` with the reason reported.
 *
 * Following the `$include` here is what makes one work everywhere the schema
 * allows it to stand: what comes back carries the file and the path the reader
 * must go on with, and they are not always the ones it asked about.
 */
function openMap(ctx: Ctx, node: Node, path: Path, what: string): Site<Mapping> | null {
  const here = follow(ctx, node, path);
  if (here === null) return null;

  if (here.node.kind !== 'map') {
    reject(here.ctx, CODE.notAMapping, `${what} must be a mapping`, here.node.span);
    return null;
  }
  return { ctx: here.ctx, node: here.node, path: here.path };
}

/** A sequence, on the same terms. */
export function openSeq(ctx: Ctx, node: Node, path: Path, what: string): Site<Sequence> | null {
  const here = follow(ctx, node, path);
  if (here === null) return null;

  if (here.node.kind !== 'seq') {
    reject(here.ctx, CODE.notASequence, `${what} must be a sequence`, here.node.span);
    return null;
  }
  return { ctx: here.ctx, node: here.node, path: here.path };
}

/** A mapping opened for reading: where it turned out to be, and its entries. */
export interface Opened extends Site<Mapping> {
  readonly entries: readonly Entry[];
}

/**
 * How every construct that is a mapping starts: follow an `$include` to
 * wherever the mapping really is, then take its entries with no key read twice.
 */
export function openEntries(ctx: Ctx, node: Node, path: Path, what: string): Opened | null {
  const opened = openMap(ctx, node, path, what);
  return opened === null ? null : { ...opened, entries: entriesOf(opened.ctx, opened.node) };
}

/**
 * Each item of a sequence, as a site of its own.
 *
 * An item may be an `$include` in its own right — one sheet of a workbook kept
 * in its own file — so following happens per item as well as for the sequence.
 */
function itemsOf(ctx: Ctx, node: Node, path: Path, what: string): Site[] {
  const opened = openSeq(ctx, node, path, what);
  if (opened === null) return [];

  return opened.node.items.map((item, index) => ({
    ctx: opened.ctx,
    node: item,
    path: [...opened.path, index],
  }));
}

/** Read every item of a sequence, leaving out the ones that could not be read. */
export function readEach<T>(
  ctx: Ctx,
  node: Node,
  path: Path,
  what: string,
  read: (site: Site) => T | null,
): T[] {
  const kept: T[] = [];
  for (const site of itemsOf(ctx, node, path, what)) {
    const one = read(site);
    if (one !== null) kept.push(one);
  }
  return kept;
}

/** Text, or `null` with the reason reported. A number is not text. */
export function expectText(ctx: Ctx, node: Node, what: string): string | null {
  const here = follow(ctx, node, []);
  if (here === null) return null;

  if (here.node.kind === 'scalar' && typeof here.node.value === 'string') return here.node.value;
  reject(here.ctx, CODE.notText, `${what} must be text`, here.node.span);
  return null;
}

export function expectBool(ctx: Ctx, node: Node, what: string): boolean | null {
  const here = follow(ctx, node, []);
  if (here === null) return null;

  if (here.node.kind === 'scalar' && typeof here.node.value === 'boolean') return here.node.value;
  reject(here.ctx, CODE.notABoolean, `${what} must be true or false`, here.node.span);
  return null;
}

export function expectNumber(ctx: Ctx, node: Node, what: string): number | null {
  const here = follow(ctx, node, []);
  if (here === null) return null;

  if (here.node.kind === 'scalar' && typeof here.node.value === 'number') return here.node.value;
  reject(here.ctx, CODE.notANumber, `${what} must be a number`, here.node.span);
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
  const here = follow(ctx, node, []);
  if (here === null) return null;

  if (here.node.kind === 'scalar' && here.node.value !== null) return here.node.value;
  const message = `${what} must be text, a number, or a boolean`;
  reject(here.ctx, CODE.notAValue, message, here.node.span);
  return null;
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

/**
 * A mapping's entries, in the order written and without a repeated key.
 *
 * A repeat is reported and dropped rather than layered, which is what yxl does
 * with one and what keeps two nodes from deriving the same identity.
 */
function entriesOf(ctx: Ctx, map: Mapping): Entry[] {
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
