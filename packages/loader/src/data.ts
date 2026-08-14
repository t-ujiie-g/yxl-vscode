import type { Entry, Node, Path } from '@yxl-vscode/cst';
import {
  type DataBlock,
  type DataRow,
  type DataSource,
  MODELED_KEYS,
  type ScalarValue,
} from '@yxl-vscode/spec';
import { CODE } from './codes';
import {
  type Ctx,
  entriesOf,
  expectMap,
  expectSeq,
  expectText,
  findEntry,
  keyOf,
  nodeAt,
  reject,
  rejectUnknownKey,
} from './read';
import { ADDRESS, PATH, readAs } from './template';

/** A sheet's `data:` sequence: one anchored table per entry. */
export function readDataBlocks(ctx: Ctx, node: Node, path: Path): DataBlock[] {
  const seq = expectSeq(ctx, node, '`data`');
  if (seq === null) return [];

  const blocks: DataBlock[] = [];
  for (const [index, item] of seq.items.entries()) {
    const block = readDataBlock(ctx, item, [...path, index]);
    if (block !== null) blocks.push(block);
  }
  return blocks;
}

function readDataBlock(ctx: Ctx, node: Node, path: Path): DataBlock | null {
  const what = 'a `data` entry';
  const map = expectMap(ctx, node, what);
  if (map === null) return null;

  const entries = entriesOf(ctx, map);

  const anchor = findEntry(entries, 'at');
  if (anchor === undefined) {
    reject(ctx, CODE.missingKey, `${what} needs an \`at\``, node.span);
    return null;
  }
  const at = readAs(ctx, anchor.value, `${what} \`at\``, ADDRESS);
  if (at === null) return null;

  const source = readSource(ctx, entries, node, what);
  return source === null ? null : { ...nodeAt(ctx, path, node.span), at, source };
}

/**
 * Where the rows come from. Exactly one of `values`, `csv`, or `json`, and
 * `columns` names the fields of an array of JSON objects — the one source whose
 * field order is not its own.
 */
function readSource(
  ctx: Ctx,
  entries: readonly Entry[],
  node: Node,
  what: string,
): DataSource | null {
  let source: DataSource | null = null;
  let columns: readonly string[] | null = null;

  for (const entry of entries) {
    const key = keyOf(entry);
    const at = `${what} \`${key}\``;
    switch (key) {
      case 'at':
        break;
      case 'values':
        source = pickSource(ctx, source, entry, {
          kind: 'inline',
          rows: readRows(ctx, entry.value),
        });
        break;
      case 'csv': {
        const path = readAs(ctx, entry.value, at, PATH);
        if (path !== null) source = pickSource(ctx, source, entry, { kind: 'csv', path });
        break;
      }
      case 'json': {
        const path = readAs(ctx, entry.value, at, PATH);
        if (path !== null) {
          source = pickSource(ctx, source, entry, { kind: 'json', path, columns: null });
        }
        break;
      }
      case 'columns':
        columns = readColumnNames(ctx, entry.value, at);
        break;
      default:
        rejectUnknownKey(ctx, entry, what, MODELED_KEYS.data);
    }
  }

  if (source === null) {
    reject(ctx, CODE.missingKey, `${what} needs \`values\`, \`csv\`, or \`json\``, node.span);
    return null;
  }

  if (columns === null) return source;
  if (source.kind !== 'json') {
    const message = `${what} names \`columns\`, which only an array of JSON objects has`;
    reject(ctx, CODE.conflictingKeys, message, node.span);
    return source;
  }
  return { ...source, columns };
}

function pickSource(ctx: Ctx, taken: DataSource | null, entry: Entry, source: DataSource) {
  if (taken === null) return source;

  const message = `a \`data\` entry takes its rows from one place; \`${keyOf(entry)}\` is a second`;
  reject(ctx, CODE.conflictingKeys, message, entry.span);
  return taken;
}

function readColumnNames(ctx: Ctx, node: Node, what: string): readonly string[] | null {
  const seq = expectSeq(ctx, node, what);
  if (seq === null) return null;

  const names: string[] = [];
  for (const item of seq.items) {
    const name = expectText(ctx, item, `a name in ${what}`);
    if (name !== null) names.push(name);
  }
  return names;
}

function readRows(ctx: Ctx, node: Node): readonly DataRow[] {
  const seq = expectSeq(ctx, node, 'a `data` entry `values`');
  if (seq === null) return [];

  const rows: DataRow[] = [];
  for (const [index, item] of seq.items.entries()) {
    rows.push(readRow(ctx, item, `row ${index + 1} of a \`data\` entry`));
  }
  return rows;
}

/**
 * One row of fields.
 *
 * A `null` field is a blank the table leaves for something else to fill — a
 * `formulas:` range covering the gap — so it is a value here rather than the
 * unfinished key `expectValue` refuses elsewhere.
 */
function readRow(ctx: Ctx, node: Node, what: string): DataRow {
  const seq = expectSeq(ctx, node, what);
  if (seq === null) return [];

  const fields: ScalarValue[] = [];
  for (const [index, item] of seq.items.entries()) {
    if (item.kind === 'scalar') {
      fields.push(item.value);
      continue;
    }
    const message = `field ${index + 1} of ${what} must be text, a number, a boolean, or null`;
    reject(ctx, CODE.notAValue, message, item.span);
    // Blank rather than absent: dropping the field would move every field after
    // it one column left, which is a worse answer than an empty cell.
    fields.push(null);
  }
  return fields;
}
