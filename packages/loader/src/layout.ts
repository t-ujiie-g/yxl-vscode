import type { Entry, Node, Path } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import {
  type BlockDef,
  type BlockPlacement,
  type DataSource,
  FOOTER_TOTALS,
  type FooterCell,
  type FooterEntry,
  type GroupOrder,
  type HeaderCell,
  type Layout,
  type LayoutColumn,
  type LayoutEntry,
  MODELED_KEYS,
  type StyleUse,
} from '@yxl-vscode/spec';
import { readAnchor } from './anchor';
import {
  holdsSomething,
  NOTHING_ELSE,
  readCellNode,
  readFacets,
  withoutLeadingEquals,
} from './cell';
import { CODE } from './codes';
import { readColumnRules } from './conditional';
import { type Ctx, identify, keyOf, reject, type Site } from './ctx';
import { readRows } from './data';
import {
  expectBool,
  expectNumber,
  expectText,
  expectValue,
  findEntry,
  isCleared,
  type Opened,
  open,
  openEntries,
  openSeq,
  readEach,
  rejectUnknownKey,
  required,
} from './read';
import { readStyleUse } from './style';
import { isLayoutName, isName, PATH, readAs, spelling } from './template';
import { entryOf, say, under } from './text';

/** A sheet's `layouts:` sequence (`docs/spec.md` §25). */
export function readLayouts(ctx: Ctx, node: Node, path: Path): Layout[] {
  return readEach(ctx, node, path, '`layouts`', readLayout);
}

function readLayout(site: Site): Layout | null {
  const what = entryOf('layouts');
  const opened = open(site, what, MODELED_KEYS.layout);
  if (opened === null) return null;
  const here = opened.ctx;

  const at = required(opened, 'at', what, (node) => readAnchor(here, node, under(what, 'at')));
  const columns = required(opened, 'columns', what, (node) =>
    readEntries(here, node, [...opened.path, 'columns'], what),
  );
  if (at === null || columns === null) return null;

  let name: string | null = null;
  let rows: number | null = null;
  let source: DataSource | null = null;
  let headerStyle: StyleUse | null = null;
  let footer: FooterEntry[] = [];

  for (const entry of opened.entries) {
    const key = keyOf(entry);
    const said = under(what, key);
    switch (key) {
      case 'name':
        name = readLayoutName(here, entry.value, said);
        break;
      case 'rows':
        rows = expectNumber(here, entry.value, said);
        break;
      case 'header_style':
        headerStyle = readStyleUse(here, entry.value, said);
        break;
      case 'footer':
        footer = readFooter(here, entry.value, [...opened.path, key], what);
        break;
      case 'values':
      case 'csv':
      case 'json':
        source = pickSource(here, source, entry, readSource(here, entry, what));
        break;
      default:
        break;
    }
  }

  return {
    ...identify(here, opened.path, opened.node.span),
    at,
    name,
    rows,
    source,
    headerStyle,
    columns,
    footer,
  };
}

/** `defs.blocks`: each a named group of layout columns, placed where a layout names it. */
export function readBlockDefs(ctx: Ctx, node: Node, path: Path): BlockDef[] {
  const opened = openEntries(ctx, node, path, '`defs.blocks`');
  if (opened === null) return [];

  const defs: BlockDef[] = [];
  for (const entry of opened.entries) {
    const name = keyOf(entry);
    const what = say('loader.named', { of: 'block', name });
    const at = [...opened.path, name];
    const block = open({ ctx: opened.ctx, node: entry.value, path: at }, what, MODELED_KEYS.block);
    if (block === null) continue;

    const columns = required(block, 'columns', what, (one) =>
      readEach(block.ctx, one, [...block.path, 'columns'], under(what, 'columns'), (site) =>
        placesABlock(site) ? nested(site, what) : readColumn(site, what),
      ),
    );
    if (columns !== null) defs.push({ ...identify(opened.ctx, at, entry.span), name, columns });
  }
  return defs;
}

function placesABlock(site: Site): boolean {
  return site.node.kind === 'map' && findEntry(site.node.entries, 'block') !== undefined;
}

function nested(site: Site, what: Saying): null {
  reject(
    site.ctx,
    CODE.conflictingKeys,
    say('loader.blocks-do-not-nest', { what }),
    site.node.span,
  );
  return null;
}

function readEntries(ctx: Ctx, node: Node, path: Path, what: Saying): LayoutEntry[] {
  return readEach(ctx, node, path, under(what, 'columns'), (site) =>
    placesABlock(site) ? readPlacement(site, what) : readColumn(site, what),
  );
}

function readColumn(site: Site, of: Saying): LayoutColumn | null {
  const what = say('loader.a-column-of', { what: of });
  const opened = open(site, what, MODELED_KEYS.layoutColumn);
  if (opened === null) return null;
  const here = opened.ctx;

  const name = required(opened, 'name', what, (one) =>
    readColumnName(here, one, under(what, 'name')),
  );
  if (name === null) return null;

  const column: { -readonly [K in keyof LayoutColumn]: LayoutColumn[K] } = {
    ...identify(here, opened.path, opened.node.span),
    kind: 'column',
    name,
    field: null,
    header: null,
    formula: null,
    conditional: [],
    width: null,
    style: null,
    format: null,
    clearsFormat: false,
    hidden: null,
    group: null,
  };

  for (const entry of opened.entries) {
    const key = keyOf(entry);
    const said = under(what, key);
    switch (key) {
      case 'field':
        column.field = expectText(here, entry.value, said);
        break;
      case 'header':
        column.header = readHeader(here, entry.value, [...opened.path, key], said);
        break;
      case 'formula': {
        const formula = expectText(here, entry.value, said);
        column.formula = formula === null ? null : withoutLeadingEquals(formula);
        break;
      }
      case 'conditional':
        column.conditional = readColumnRules(here, entry.value, [...opened.path, key], what);
        break;
      case 'width':
        column.width = expectNumber(here, entry.value, said);
        break;
      case 'style':
        column.style = readStyleUse(here, entry.value, said);
        break;
      case 'format':
        if (isCleared(entry.value)) column.clearsFormat = true;
        else column.format = expectText(here, entry.value, said);
        break;
      case 'hidden':
        column.hidden = expectBool(here, entry.value, said);
        break;
      case 'group':
        column.group = expectNumber(here, entry.value, said);
        break;
      default:
        break;
    }
  }

  if (column.field !== null && column.formula !== null) {
    reject(here, CODE.conflictingKeys, say('loader.field-and-formula', { what }), opened.node.span);
  }
  return column;
}

function readPlacement(site: Site, of: Saying): BlockPlacement | null {
  const what = say('loader.a-column-of', { what: of });
  const opened = open(site, what, MODELED_KEYS.blockPlacement);
  if (opened === null) return null;
  const here = opened.ctx;

  const block = required(opened, 'block', what, (one) =>
    expectText(here, one, under(what, 'block')),
  );
  if (block === null) return null;

  let as: string | null = null;
  let header: BlockPlacement['header'] = null;
  let fields: [string, string][] = [];

  for (const entry of opened.entries) {
    const key = keyOf(entry);
    const said = under(what, key);
    if (key === 'as') as = readColumnName(here, entry.value, said);
    if (key === 'header') header = readHeader(here, entry.value, [...opened.path, key], said);
    if (key === 'fields') fields = readFields(here, entry.value, said);
  }

  return {
    ...identify(here, opened.path, opened.node.span),
    kind: 'block',
    block,
    as,
    header,
    fields,
  };
}

function readFields(ctx: Ctx, node: Node, what: Saying): [string, string][] {
  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return [];

  const fields: [string, string][] = [];
  for (const entry of opened.entries) {
    const field = expectText(opened.ctx, entry.value, under(what, keyOf(entry)));
    if (field !== null) fields.push([keyOf(entry), field]);
  }
  return fields;
}

/** A column's `header:`, as its levels top first: one cell is one level, and `null` in a list is a blank. */
function readHeader(ctx: Ctx, node: Node, path: Path, what: Saying): (HeaderCell | null)[] | null {
  if (node.kind !== 'seq') {
    const cell = readHeaderCell(ctx, node, path, what);
    return cell === null ? null : [cell];
  }

  const opened = openSeq(ctx, node, path, what);
  if (opened === null) return null;
  if (opened.node.items.length === 0) {
    reject(opened.ctx, CODE.missingKey, say('loader.no-levels', { what }), node.span);
    return null;
  }

  return opened.node.items.map((item, index) => {
    if (isCleared(item)) return null;

    const level = say('loader.row-of', { what, index: index + 1 });
    if (item.kind === 'seq') {
      reject(opened.ctx, CODE.notAValue, say('loader.levels-are-cells', { what }), item.span);
      return null;
    }
    return readHeaderCell(opened.ctx, item, [...opened.path, index], level);
  });
}

function readHeaderCell(ctx: Ctx, node: Node, path: Path, what: Saying): HeaderCell | null {
  const facets = readCellNode(ctx, node, what);
  return facets === null ? null : { ...identify(ctx, path, node.span), ...facets };
}

function readFooter(ctx: Ctx, node: Node, path: Path, of: Saying): FooterEntry[] {
  const what = under(of, 'footer');
  return readEach(ctx, node, path, what, (site) => {
    const opened = openEntries(site.ctx, site.node, site.path, what);
    if (opened === null) return null;

    if (findEntry(opened.entries, 'row') !== undefined) return readFooterRow(opened, what);
    if (findEntry(opened.entries, 'by') !== undefined) return readFooterGroup(opened, of);

    reject(opened.ctx, CODE.missingKey, say('loader.row-or-group', { what }), opened.node.span);
    return null;
  });
}

function readFooterRow(opened: Opened, what: Saying): FooterEntry | null {
  const here = opened.ctx;
  for (const entry of opened.entries) {
    if (!MODELED_KEYS.footerRow.has(keyOf(entry))) {
      rejectUnknownKey(here, entry, what, MODELED_KEYS.footerRow);
    }
  }

  const style = findEntry(opened.entries, 'style');
  const row = required(opened, 'row', what, (node) =>
    openEntries(here, node, [...opened.path, 'row'], under(what, 'row')),
  );
  if (row === null) return null;

  const cells = row.entries.flatMap((entry) => {
    const cell = readFooterCell(row.ctx, entry, row.path, under(what, keyOf(entry)));
    return cell === null ? [] : [cell];
  });

  return {
    ...identify(here, opened.path, opened.node.span),
    kind: 'row',
    cells,
    style: style === undefined ? null : readStyleUse(here, style.value, under(what, 'style')),
  };
}

/** A footer cell: a cell as §3 writes one, or `{ total: … }`, either of them with a `merge_to`. */
function readFooterCell(ctx: Ctx, entry: Entry, path: Path, what: Saying): FooterCell | null {
  const column = keyOf(entry);
  const site = identify(ctx, [...path, column], entry.span);
  const node = entry.value;

  const extra = node.kind === 'map' ? node.entries : [];
  const total = extra.find((one) => keyOf(one) === 'total');
  const mergeTo = extra.find((one) => keyOf(one) === 'merge_to');
  if (total === undefined && mergeTo === undefined) {
    const facets = readCellNode(ctx, node, what);
    return facets === null ? null : { ...site, ...facets, column, total: null, mergeTo: null };
  }

  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.footerCell);
  if (opened === null) return null;

  const merges =
    mergeTo === undefined ? null : expectText(ctx, mergeTo.value, under(what, 'merge_to'));
  const facets = readFacets(opened.ctx, opened.entries, what);
  if (total === undefined) {
    return holdsSomething(opened.ctx, facets, node, what)
      ? { ...site, ...facets, column, total: null, mergeTo: merges }
      : null;
  }

  const sums = readAs(ctx, total.value, under(what, 'total'), spelling(FOOTER_TOTALS));
  if (sums === null || typeof sums !== 'string') return null;
  return { ...site, ...NOTHING_ELSE, value: null, column, total: sums, mergeTo: merges };
}

function readFooterGroup(opened: Opened, of: Saying): FooterEntry | null {
  const here = opened.ctx;
  const what = under(of, 'footer');
  for (const entry of opened.entries) {
    if (!MODELED_KEYS.footerGroup.has(keyOf(entry))) {
      rejectUnknownKey(here, entry, what, MODELED_KEYS.footerGroup);
    }
  }

  const by = required(opened, 'by', what, (node) => expectText(here, node, under(what, 'by')));
  const rows = findEntry(opened.entries, 'rows');
  if (rows === undefined) {
    reject(here, CODE.missingKey, say('loader.needs', { what, key: 'rows' }), opened.node.span);
    return null;
  }
  if (by === null) return null;

  const order = findEntry(opened.entries, 'order');
  const ordered =
    order === undefined ? { kind: 'data' as const } : readOrder(here, order.value, what);
  if (ordered === null) return null;

  return {
    ...identify(here, opened.path, opened.node.span),
    kind: 'group',
    by,
    order: ordered,
    rows: readFooter(here, rows.value, [...opened.path, 'rows'], of),
  };
}

const ORDERS = ['data', 'asc', 'desc'] as const;

function readOrder(ctx: Ctx, node: Node, of: Saying): GroupOrder | null {
  const what = under(of, 'order');
  if (node.kind !== 'seq') {
    const kind = readAs(ctx, node, what, spelling(ORDERS));
    return kind === null || typeof kind !== 'string' ? null : { kind };
  }

  const values = node.items.map((item) =>
    isCleared(item) ? null : expectValue(ctx, item, say('loader.a-name-in', { what })),
  );
  return { kind: 'listed', values };
}

function readColumnName(ctx: Ctx, node: Node, what: Saying): string | null {
  const name = expectText(ctx, node, what);
  if (name === null || isName(name, false)) return name;

  reject(ctx, CODE.badName, say('loader.not-a-column-name', { what, name }), node.span);
  return null;
}

function readLayoutName(ctx: Ctx, node: Node, what: Saying): string | null {
  const name = expectText(ctx, node, what);
  if (name === null || isLayoutName(name)) return name;

  reject(ctx, CODE.badName, say('loader.not-a-layout-name', { what, name }), node.span);
  return null;
}

function readSource(ctx: Ctx, entry: Entry, what: Saying): DataSource | null {
  const key = keyOf(entry);
  if (key === 'values') return { kind: 'inline', rows: readRows(ctx, entry.value, what) };

  const path = readAs(ctx, entry.value, under(what, key), PATH);
  if (path === null) return null;
  return key === 'csv' ? { kind: 'csv', path } : { kind: 'json', path, columns: null };
}

function pickSource(
  ctx: Ctx,
  taken: DataSource | null,
  entry: Entry,
  source: DataSource | null,
): DataSource | null {
  if (taken === null) return source;

  const message = say('loader.rows-from-one-place', { key: keyOf(entry) });
  reject(ctx, CODE.conflictingKeys, message, entry.span);
  return taken;
}
