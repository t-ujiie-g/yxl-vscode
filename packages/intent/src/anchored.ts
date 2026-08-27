import { entryOf, type Node, type Op, type Path } from '@yxl-vscode/cst';
import { KEY } from '@yxl-vscode/spec';
import { overlapping, parseA1Range, type Rect, rectOf } from '@yxl-vscode/units';

/** One entry of such a sequence: where it is in the sequence, and the range it covers. */
export interface Reached {
  readonly index: number;
  readonly rect: Rect;
}

/**
 * A sheet key holding a sequence of entries each anchored at an `at:` range —
 * `validations:` and `tables:` are both written this way. `touched` is the
 * entries a rectangle reaches, in the order the file writes them.
 */
export interface Anchored {
  readonly key: string;
  readonly sheet: Path;
  readonly under: Path;
  readonly many: number;
  readonly touched: readonly Reached[];
}

/** What a sheet writes under `key`, read against the rectangle a gesture is about. */
export function anchored(found: { node: Node; path: Path }, key: string, rect: Rect): Anchored {
  const touched: Reached[] = [];

  itemsUnder(found, key).forEach((item, index) => {
    const at = rectAt(item);
    if (at !== null && overlapping(at, rect)) touched.push({ index, rect: at });
  });

  return { ...sequenceIn(found, key), touched };
}

/** The same, for a key whose entries no rectangle is asked about: a float is anchored at one cell. */
export function sequenceIn(found: { node: Node; path: Path }, key: string): Anchored {
  const many = itemsUnder(found, key).length;
  return { key, sheet: found.path, under: [...found.path, key], many, touched: [] };
}

function itemsUnder(found: { node: Node; path: Path }, key: string): readonly Node[] {
  const written = entryOf(found.node, key)?.value ?? null;
  return written?.kind === 'seq' ? written.items : [];
}

/** One entry going in after the ones already there, with the key itself where there are none. */
export function putEntry(where: Anchored, body: string): Op {
  return where.many === 0
    ? { op: 'addSource', path: where.sheet, key: where.key, source: itemOf(body) }
    : { op: 'insertSource', path: where.under, index: where.many, source: body };
}

/** The entries a rectangle reaches, taken out; the key goes with the last of them. */
export function takeEntries(
  where: Anchored,
  nothing: string,
): { ops: readonly Op[] } | { why: string } {
  if (where.touched.length === 0) return { why: nothing };
  if (where.touched.length === where.many) return { ops: [{ op: 'remove', path: where.under }] };

  return { ops: where.touched.map((one) => ({ op: 'remove', path: [...where.under, one.index] })) };
}

/** The range one entry covers, as the file writes it; a `${...}` in its place covers nothing here. */
function rectAt(item: Node): Rect | null {
  const written = entryOf(item, KEY.at)?.value ?? null;
  if (written === null || written.kind !== 'scalar' || typeof written.value !== 'string') {
    return null;
  }

  const read = parseA1Range(written.value);
  return read === null ? null : rectOf(read);
}

/** The same entry as the first item of a sequence: `- ` takes two columns, and what follows lines up under it. */
export function itemOf(entry: string): string {
  return `- ${entry.split('\n').join('\n  ')}`;
}
