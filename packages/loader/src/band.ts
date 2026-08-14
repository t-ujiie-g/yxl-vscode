import type { Entry, Node, Path } from '@yxl-vscode/cst';
import {
  type ColumnBand,
  MODELED_KEYS,
  type RowBand,
  type StyleUse,
  type Templated,
} from '@yxl-vscode/spec';
import { CODE } from './codes';
import {
  type Ctx,
  entriesOf,
  expectBool,
  expectMap,
  expectNumber,
  expectSeq,
  expectText,
  findEntry,
  keyOf,
  nodeAt,
  reject,
  rejectUnknownKey,
  scalarText,
} from './read';
import { readStyleUse } from './style';
import { COLUMN, type Kind, ROW, readTextAs } from './template';

/** A sheet's `columns:` sequence, sized in character units. */
export function readColumnBands(ctx: Ctx, node: Node, path: Path): ColumnBand[] {
  const what = 'a `columns` entry';
  const bands: ColumnBand[] = [];

  for (const [index, item] of itemsOf(ctx, node, '`columns`').entries()) {
    const entries = openBand(ctx, item, what);
    if (entries === null) continue;

    const at = readSelector(ctx, entries, item, what, COLUMN);
    if (at === null) continue;

    const body = readBandBody(ctx, entries, what, 'width', MODELED_KEYS.columnBand);
    bands.push({ ...nodeAt(ctx, [...path, index], item.span), at, width: body.size, ...body.rest });
  }

  return bands;
}

/** The same over rows, sized in points. */
export function readRowBands(ctx: Ctx, node: Node, path: Path): RowBand[] {
  const what = 'a `rows` entry';
  const bands: RowBand[] = [];

  for (const [index, item] of itemsOf(ctx, node, '`rows`').entries()) {
    const entries = openBand(ctx, item, what);
    if (entries === null) continue;

    const at = readSelector(ctx, entries, item, what, ROW);
    if (at === null) continue;

    const body = readBandBody(ctx, entries, what, 'height', MODELED_KEYS.rowBand);
    bands.push({
      ...nodeAt(ctx, [...path, index], item.span),
      at,
      height: body.size,
      ...body.rest,
    });
  }

  return bands;
}

function itemsOf(ctx: Ctx, node: Node, what: string): readonly Node[] {
  return expectSeq(ctx, node, what)?.items ?? [];
}

function openBand(ctx: Ctx, node: Node, what: string): Entry[] | null {
  const map = expectMap(ctx, node, what);
  return map === null ? null : entriesOf(ctx, map);
}

interface BandBody {
  readonly size: number | null;
  readonly rest: {
    readonly style: StyleUse | null;
    readonly format: string | null;
    readonly hidden: boolean | null;
    readonly group: number | null;
  };
}

/**
 * Everything but the selector, which the two axes share (`docs/spec.md` §4)
 * apart from the key their size is written under.
 */
function readBandBody(
  ctx: Ctx,
  entries: readonly Entry[],
  what: string,
  sizeKey: string,
  known: ReadonlySet<string>,
): BandBody {
  let size: number | null = null;
  let style: StyleUse | null = null;
  let format: string | null = null;
  let hidden: boolean | null = null;
  let group: number | null = null;

  for (const entry of entries) {
    const key = keyOf(entry);
    const at = `${what} \`${key}\``;
    if (key === sizeKey) {
      size = expectNumber(ctx, entry.value, at);
      continue;
    }
    switch (key) {
      case 'at':
        break;
      case 'style':
        style = readStyleUse(ctx, entry.value, at);
        break;
      case 'format':
        format = expectText(ctx, entry.value, at);
        break;
      case 'hidden':
        hidden = expectBool(ctx, entry.value, at);
        break;
      case 'group':
        group = expectNumber(ctx, entry.value, at);
        break;
      default:
        rejectUnknownKey(ctx, entry, what, known);
    }
  }

  return { size, rest: { style, format, hidden, group } };
}

/** A band's `at`, which a row may write as a number. */
function readSelector<T>(
  ctx: Ctx,
  entries: readonly Entry[],
  node: Node,
  what: string,
  kind: Kind<T>,
): Templated<T> | null {
  const entry = findEntry(entries, 'at');
  if (entry === undefined) {
    reject(ctx, CODE.missingKey, `${what} needs an \`at\``, node.span);
    return null;
  }

  const text = scalarText(entry.value);
  if (text === null) {
    reject(ctx, CODE.notText, `${what} \`at\` must be text or a number`, entry.value.span);
    return null;
  }

  return readTextAs(ctx, text, entry.value.span, `${what} \`at\``, kind);
}
