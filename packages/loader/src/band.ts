import type { Entry, Node, Path } from '@yxl-vscode/cst';
import {
  type ColumnBand,
  MODELED_KEYS,
  type RowBand,
  type StyleUse,
  type Templated,
} from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, keyOf, nodeAt, reject, type Site } from './ctx';
import {
  entriesOf,
  expectBool,
  expectNumber,
  expectText,
  findEntry,
  itemsOf,
  openMap,
  rejectUnknownKey,
  scalarText,
} from './read';
import { readStyleUse } from './style';
import { COLUMN, type Kind, ROW, readTextAs } from './template';

/** A sheet's `columns:` sequence, sized in character units. */
export function readColumnBands(ctx: Ctx, node: Node, path: Path): ColumnBand[] {
  const what = 'a `columns` entry';
  const bands: ColumnBand[] = [];

  for (const item of itemsOf(ctx, node, path, '`columns`')) {
    const band = openBand(item, what);
    if (band === null) continue;

    const at = readSelector(band, what, COLUMN);
    if (at === null) continue;

    const body = readBandBody(band, what, 'width', MODELED_KEYS.columnBand);
    bands.push({
      ...nodeAt(band.ctx, band.path, band.node.span),
      at,
      width: body.size,
      ...body.rest,
    });
  }

  return bands;
}

/** The same over rows, sized in points. */
export function readRowBands(ctx: Ctx, node: Node, path: Path): RowBand[] {
  const what = 'a `rows` entry';
  const bands: RowBand[] = [];

  for (const item of itemsOf(ctx, node, path, '`rows`')) {
    const band = openBand(item, what);
    if (band === null) continue;

    const at = readSelector(band, what, ROW);
    if (at === null) continue;

    const body = readBandBody(band, what, 'height', MODELED_KEYS.rowBand);
    bands.push({
      ...nodeAt(band.ctx, band.path, band.node.span),
      at,
      height: body.size,
      ...body.rest,
    });
  }

  return bands;
}

interface Band {
  readonly ctx: Ctx;
  readonly node: Node;
  readonly path: Path;
  readonly entries: readonly Entry[];
}

function openBand(site: Site, what: string): Band | null {
  const opened = openMap(site.ctx, site.node, site.path, what);
  if (opened === null) return null;

  return {
    ctx: opened.ctx,
    node: opened.node,
    path: opened.path,
    entries: entriesOf(opened.ctx, opened.node),
  };
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
  band: Band,
  what: string,
  sizeKey: string,
  known: ReadonlySet<string>,
): BandBody {
  let size: number | null = null;
  let style: StyleUse | null = null;
  let format: string | null = null;
  let hidden: boolean | null = null;
  let group: number | null = null;

  for (const entry of band.entries) {
    const key = keyOf(entry);
    const at = `${what} \`${key}\``;
    if (key === sizeKey) {
      size = expectNumber(band.ctx, entry.value, at);
      continue;
    }
    switch (key) {
      case 'at':
        break;
      case 'style':
        style = readStyleUse(band.ctx, entry.value, at);
        break;
      case 'format':
        format = expectText(band.ctx, entry.value, at);
        break;
      case 'hidden':
        hidden = expectBool(band.ctx, entry.value, at);
        break;
      case 'group':
        group = expectNumber(band.ctx, entry.value, at);
        break;
      default:
        rejectUnknownKey(band.ctx, entry, what, known);
    }
  }

  return { size, rest: { style, format, hidden, group } };
}

/** A band's `at`, which a row may write as a number. */
function readSelector<T>(band: Band, what: string, kind: Kind<T>): Templated<T> | null {
  const entry = findEntry(band.entries, 'at');
  if (entry === undefined) {
    reject(band.ctx, CODE.missingKey, `${what} needs an \`at\``, band.node.span);
    return null;
  }

  const text = scalarText(entry.value);
  if (text === null) {
    reject(band.ctx, CODE.notText, `${what} \`at\` must be text or a number`, entry.value.span);
    return null;
  }

  return readTextAs(band.ctx, text, entry.value.span, `${what} \`at\``, kind);
}
