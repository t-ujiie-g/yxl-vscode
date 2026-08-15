import type { Node, Path } from '@yxl-vscode/cst';
import {
  type ColumnBand,
  MODELED_KEYS,
  type RowBand,
  type StyleUse,
  type Templated,
} from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, keyOf, nodeAt, reject } from './ctx';
import {
  expectBool,
  expectNumber,
  expectText,
  findEntry,
  type Opened,
  openEntries,
  readEach,
  rejectUnknownKey,
  scalarText,
} from './read';
import { readStyleUse } from './style';
import { COLUMN, type Kind, ROW, readTextAs } from './template';

/** A sheet's `columns:` sequence, sized in character units. */
export function readColumnBands(ctx: Ctx, node: Node, path: Path): ColumnBand[] {
  const what = 'a `columns` entry';

  return readEach(ctx, node, path, '`columns`', (site) => {
    const band = openEntries(site.ctx, site.node, site.path, what);
    if (band === null) return null;

    const at = readSelector(band, what, COLUMN);
    if (at === null) return null;

    const body = readBandBody(band, what, 'width', MODELED_KEYS.columnBand);
    return { ...nodeAt(band.ctx, band.path, band.node.span), at, width: body.size, ...body.rest };
  });
}

/** The same over rows, sized in points. */
export function readRowBands(ctx: Ctx, node: Node, path: Path): RowBand[] {
  const what = 'a `rows` entry';

  return readEach(ctx, node, path, '`rows`', (site) => {
    const band = openEntries(site.ctx, site.node, site.path, what);
    if (band === null) return null;

    const at = readSelector(band, what, ROW);
    if (at === null) return null;

    const body = readBandBody(band, what, 'height', MODELED_KEYS.rowBand);
    return { ...nodeAt(band.ctx, band.path, band.node.span), at, height: body.size, ...body.rest };
  });
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
  band: Opened,
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
function readSelector<T>(band: Opened, what: string, kind: Kind<T>): Templated<T> | null {
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
