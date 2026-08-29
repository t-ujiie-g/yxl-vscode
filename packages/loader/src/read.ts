import type { Entry, Mapping, Node, Path, Sequence } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import type { ScalarValue } from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, keyOf, reject, type Site } from './ctx';
import { follow } from './include';
import { say, under } from './text';

/** A mapping, wherever an `$include` put it, or `null` with the reason reported; it carries the file to go on with. */
function openMap(ctx: Ctx, node: Node, path: Path, what: Saying): Site<Mapping> | null {
  const here = follow(ctx, node, path);
  if (here === null) return null;

  if (here.node.kind !== 'map') {
    reject(here.ctx, CODE.notAMapping, say('loader.must-be-a-mapping', { what }), here.node.span);
    return null;
  }
  return { ctx: here.ctx, node: here.node, path: here.path };
}

/** A sequence, on the same terms. */
export function openSeq(ctx: Ctx, node: Node, path: Path, what: Saying): Site<Sequence> | null {
  const here = follow(ctx, node, path);
  if (here === null) return null;

  if (here.node.kind !== 'seq') {
    reject(here.ctx, CODE.notASequence, say('loader.must-be-a-sequence', { what }), here.node.span);
    return null;
  }
  return { ctx: here.ctx, node: here.node, path: here.path };
}

/** A mapping opened for reading: where it turned out to be, and its entries. */
export interface Opened extends Site<Mapping> {
  readonly entries: readonly Entry[];
}

/** Follow an `$include` to where the mapping is, then its entries with no key read twice. */
export function openEntries(ctx: Ctx, node: Node, path: Path, what: Saying): Opened | null {
  const opened = openMap(ctx, node, path, what);
  return opened === null ? null : { ...opened, entries: entriesOf(opened.ctx, opened.node) };
}

/** Each item of a sequence as a site of its own; an item may itself be an `$include`. */
function itemsOf(ctx: Ctx, node: Node, path: Path, what: Saying): Site[] {
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
  what: Saying,
  read: (site: Site) => T | null,
): T[] {
  const kept: T[] = [];
  for (const site of itemsOf(ctx, node, path, what)) {
    const one = read(site);
    if (one !== null) kept.push(one);
  }
  return kept;
}

/** Whether a node is the `null` that says an attribute is not set — an empty value included (`docs/spec.md` §6). */
export function isCleared(node: Node): boolean {
  return node.kind === 'scalar' && node.value === null;
}

/** Text, or `null` with the reason reported. A number is not text. */
export function expectText(ctx: Ctx, node: Node, what: Saying): string | null {
  const here = follow(ctx, node, []);
  if (here === null) return null;

  if (here.node.kind === 'scalar' && typeof here.node.value === 'string') return here.node.value;
  reject(here.ctx, CODE.notText, say('loader.must-be-text', { what }), here.node.span);
  return null;
}

/** `true` or `false`, or `null` with the reason reported; `yes` is text, as YAML 1.2 has it. */
export function expectBool(ctx: Ctx, node: Node, what: Saying): boolean | null {
  const here = follow(ctx, node, []);
  if (here === null) return null;

  if (here.node.kind === 'scalar' && typeof here.node.value === 'boolean') return here.node.value;
  reject(here.ctx, CODE.notABoolean, say('loader.must-be-a-boolean', { what }), here.node.span);
  return null;
}

/** A number, or `null` with the reason reported. Text that looks like one is not one. */
export function expectNumber(ctx: Ctx, node: Node, what: Saying): number | null {
  const here = follow(ctx, node, []);
  if (here === null) return null;

  if (here.node.kind === 'scalar' && typeof here.node.value === 'number') return here.node.value;
  reject(here.ctx, CODE.notANumber, say('loader.must-be-a-number', { what }), here.node.span);
  return null;
}

/**
 * A value a cell or a definition can hold. `null` is refused, as yxl refuses
 * it; inline `data:` rows are the one place it means something and read their
 * own fields.
 */
export function expectValue(ctx: Ctx, node: Node, what: Saying): ScalarValue | null {
  const here = follow(ctx, node, []);
  if (here === null) return null;

  if (here.node.kind === 'scalar' && here.node.value !== null) return here.node.value;
  const message = say('loader.must-be-a-value', { what });
  reject(here.ctx, CODE.notAValue, message, here.node.span);
  return null;
}

/** A mapping's entries as written, a repeated key reported and dropped as yxl drops it. */
function entriesOf(ctx: Ctx, map: Mapping): Entry[] {
  const seen = new Set<string>();
  const kept: Entry[] = [];

  for (const entry of map.entries) {
    const key = keyOf(entry);
    if (seen.has(key)) {
      reject(ctx, CODE.duplicateKey, say('loader.written-twice', { key }), entry.span);
      continue;
    }
    seen.add(key);
    kept.push(entry);
  }

  return kept;
}

/** Report a key the construct does not have, naming the ones it does. */
export function rejectUnknownKey(
  ctx: Ctx,
  entry: Entry,
  what: Saying,
  known: ReadonlySet<string>,
): void {
  const expected = [...known].join(', ');
  const message = say('loader.unknown-key', { key: keyOf(entry), what, expected });
  reject(ctx, CODE.unknownKey, message, entry.span);
}

export function findEntry(entries: readonly Entry[], key: string): Entry | undefined {
  return entries.find((entry) => keyOf(entry) === key);
}

/** The text of a scalar that may have been written as a number: a row band's `at: 1`. */
export function scalarText(node: Node): string | null {
  if (node.kind !== 'scalar') return null;
  if (typeof node.value === 'string') return node.value;
  if (typeof node.value === 'number') return String(node.value);
  return null;
}

/** A mapping opened with every key the construct does not have reported (ADR-011). */
export function open(site: Site, what: Saying, known: ReadonlySet<string>): Opened | null {
  const opened = openEntries(site.ctx, site.node, site.path, what);
  if (opened === null) return null;

  for (const entry of opened.entries) {
    if (!known.has(keyOf(entry))) rejectUnknownKey(opened.ctx, entry, what, known);
  }
  return opened;
}

/** A key the construct cannot be read without, reported by name where it is missing. */
export function required<T>(
  opened: Opened,
  key: string,
  what: Saying,
  read: (node: Node) => T | null,
): T | null {
  const found = findEntry(opened.entries, key);
  if (found === undefined) {
    reject(opened.ctx, CODE.missingKey, say('loader.needs', { what, key: key }), opened.node.span);
    return null;
  }
  return read(found.value);
}

/** A key the spec leaves out far more often than it writes. */
export function optional<T>(opened: Opened, key: string, read: (node: Node) => T | null): T | null {
  const found = findEntry(opened.entries, key);
  return found === undefined ? null : read(found.value);
}

export function optionalText(opened: Opened, key: string, what: Saying): string | null {
  return optional(opened, key, (entry) => expectText(opened.ctx, entry, under(what, key)));
}

export function optionalNumber(opened: Opened, key: string, what: Saying): number | null {
  return optional(opened, key, (entry) => expectNumber(opened.ctx, entry, under(what, key)));
}

/** A switch the spec leaves out far more often than it writes; `unwritten` is what its absence means. */
export function flag(opened: Opened, key: string, what: Saying, unwritten = false): boolean {
  const said = optional(opened, key, (entry) => expectBool(opened.ctx, entry, under(what, key)));
  return said ?? unwritten;
}
