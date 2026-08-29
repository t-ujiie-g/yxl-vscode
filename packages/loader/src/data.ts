import type { Entry, Node, Path } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import {
  type DataBlock,
  type DataRow,
  type DataSource,
  MODELED_KEYS,
  type ScalarValue,
} from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, identify, keyOf, reject, type Site } from './ctx';
import { expectText, findEntry, openEntries, openSeq, readEach, rejectUnknownKey } from './read';
import { ADDRESS, PATH, readAs } from './template';
import { entryOf, say, under } from './text';

/** A sheet's `data:` sequence: one anchored table per entry. */
export function readDataBlocks(ctx: Ctx, node: Node, path: Path): DataBlock[] {
  return readEach(ctx, node, path, '`data`', readDataBlock);
}

function readDataBlock(site: Site): DataBlock | null {
  const what = entryOf('data');
  const opened = openEntries(site.ctx, site.node, site.path, what);
  if (opened === null) return null;

  const here = opened.ctx;
  const { entries } = opened;

  const anchor = findEntry(entries, 'at');
  if (anchor === undefined) {
    reject(here, CODE.missingKey, say('loader.needs', { what, key: 'at' }), opened.node.span);
    return null;
  }
  const at = readAs(here, anchor.value, under(what, 'at'), ADDRESS);
  if (at === null) return null;

  const source = readSource(here, entries, opened.node, what);
  if (source === null) return null;

  return { ...identify(here, opened.path, opened.node.span), at, source };
}

/** Where the rows come from: exactly one of `values`, `csv`, `json` (`docs/spec.md` §9). */
function readSource(
  ctx: Ctx,
  entries: readonly Entry[],
  node: Node,
  what: Saying,
): DataSource | null {
  let source: DataSource | null = null;
  let columns: readonly string[] | null = null;

  for (const entry of entries) {
    const key = keyOf(entry);
    const at = under(what, key);
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
    reject(ctx, CODE.missingKey, say('loader.data-needs-a-source', { what }), node.span);
    return null;
  }

  if (columns === null) return source;
  if (source.kind !== 'json') {
    const message = say('loader.columns-needs-json', { what });
    reject(ctx, CODE.conflictingKeys, message, node.span);
    return source;
  }
  return { ...source, columns };
}

function pickSource(ctx: Ctx, taken: DataSource | null, entry: Entry, source: DataSource) {
  if (taken === null) return source;

  const message = say('loader.rows-from-one-place', { key: keyOf(entry) });
  reject(ctx, CODE.conflictingKeys, message, entry.span);
  return taken;
}

function readColumnNames(ctx: Ctx, node: Node, what: Saying): readonly string[] | null {
  const opened = openSeq(ctx, node, [], what);
  if (opened === null) return null;

  const names: string[] = [];
  for (const item of opened.node.items) {
    const name = expectText(opened.ctx, item, say('loader.a-name-in', { what }));
    if (name !== null) names.push(name);
  }
  return names;
}

function readRows(ctx: Ctx, node: Node): readonly DataRow[] {
  const opened = openSeq(ctx, node, [], under(entryOf('data'), 'values'));
  if (opened === null) return [];

  const rows: DataRow[] = [];
  for (const [index, item] of opened.node.items.entries()) {
    rows.push(readRow(opened.ctx, item, `row ${index + 1} of a \`data\` entry`));
  }
  return rows;
}

/** One row of fields; `null` is a blank left for something else to fill, so it is a value here. */
function readRow(ctx: Ctx, node: Node, what: Saying): DataRow {
  const opened = openSeq(ctx, node, [], what);
  if (opened === null) return [];

  const fields: ScalarValue[] = [];
  for (const [index, item] of opened.node.items.entries()) {
    if (item.kind === 'scalar') {
      fields.push(item.value);
      continue;
    }
    const message = say('loader.field-must-be-a-value', { what, index: index + 1 });
    reject(opened.ctx, CODE.notAValue, message, item.span);
    // Dropping the field would move every field after it one column left.
    fields.push(null);
  }
  return fields;
}
