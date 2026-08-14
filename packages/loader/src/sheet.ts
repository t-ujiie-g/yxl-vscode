import type { Node, Path } from '@yxl-vscode/cst';
import {
  type Cell,
  type ColumnBand,
  type DataBlock,
  type FormulaRange,
  type Merge,
  MODELED_KEYS,
  type Opaque,
  type RowBand,
  type Sheet,
} from '@yxl-vscode/spec';
import { readColumnBands, readRowBands } from './band';
import { readCells, withoutLeadingEquals } from './cell';
import { CODE } from './codes';
import { type Ctx, keyOf, nodeAt, reject, type Site } from './ctx';
import { readDataBlocks } from './data';
import {
  entriesOf,
  expectText,
  findEntry,
  itemsOf,
  openMap,
  rejectUnknownKey,
  scalarText,
} from './read';
import { RANGE, readAs, SHEET_NAME } from './template';

/** The workbook's `sheets:` sequence, in tab order. */
export function readSheets(ctx: Ctx, node: Node, path: Path): Sheet[] {
  const sheets: Sheet[] = [];
  for (const item of itemsOf(ctx, node, path, '`sheets`')) {
    const sheet = readSheet(item);
    if (sheet !== null) sheets.push(sheet);
  }
  return sheets;
}

function readSheet(site: Site): Sheet | null {
  const opened = openMap(site.ctx, site.node, site.path, 'a sheet');
  if (opened === null) return null;

  const here = opened.ctx;
  const entries = entriesOf(here, opened.node);

  const named = findEntry(entries, 'name');
  if (named === undefined) {
    reject(here, CODE.missingKey, 'a sheet needs a `name`', opened.node.span);
    return null;
  }
  const name = readAs(here, named.value, 'a sheet `name`', SHEET_NAME);
  if (name === null) return null;

  const what = `sheet \`${scalarText(named.value) ?? ''}\``;
  let cells: Cell[] = [];
  let formulas: FormulaRange[] = [];
  let data: DataBlock[] = [];
  let columns: ColumnBand[] = [];
  let rows: RowBand[] = [];
  let merges: Merge[] = [];
  const opaque: Opaque[] = [];

  for (const entry of entries) {
    const key = keyOf(entry);
    const at = [...opened.path, key];
    switch (key) {
      case 'name':
        break;
      case 'cells':
        cells = readCells(here, entry.value, at);
        break;
      case 'formulas':
        formulas = readFormulaRanges(here, entry.value, at);
        break;
      case 'data':
        data = readDataBlocks(here, entry.value, at);
        break;
      case 'columns':
        columns = readColumnBands(here, entry.value, at);
        break;
      case 'rows':
        rows = readRowBands(here, entry.value, at);
        break;
      case 'merges':
        merges = readMerges(here, entry.value, at, what);
        break;
      default:
        opaque.push({ ...nodeAt(here, at, entry.span), key });
    }
  }

  return {
    ...nodeAt(here, opened.path, opened.node.span),
    name,
    cells,
    formulas,
    data,
    columns,
    rows,
    merges,
    keyOrder: entries.map(keyOf),
    opaque,
  };
}

function readMerges(ctx: Ctx, node: Node, path: Path, what: string): Merge[] {
  const merges: Merge[] = [];
  for (const item of itemsOf(ctx, node, path, `${what} \`merges\``)) {
    const at = readAs(item.ctx, item.node, 'a `merges` entry', RANGE);
    if (at !== null) merges.push({ ...nodeAt(item.ctx, item.path, item.node.span), at });
  }
  return merges;
}

function readFormulaRanges(ctx: Ctx, node: Node, path: Path): FormulaRange[] {
  const ranges: FormulaRange[] = [];
  for (const item of itemsOf(ctx, node, path, '`formulas`')) {
    const range = readFormulaRange(item);
    if (range !== null) ranges.push(range);
  }
  return ranges;
}

function readFormulaRange(site: Site): FormulaRange | null {
  const what = 'a `formulas` entry';
  const opened = openMap(site.ctx, site.node, site.path, what);
  if (opened === null) return null;

  const here = opened.ctx;
  const entries = entriesOf(here, opened.node);
  for (const entry of entries) {
    if (!MODELED_KEYS.formulaRange.has(keyOf(entry))) {
      rejectUnknownKey(here, entry, what, MODELED_KEYS.formulaRange);
    }
  }

  const anchor = findEntry(entries, 'at');
  const written = findEntry(entries, 'formula');
  if (anchor === undefined || written === undefined) {
    const missing = anchor === undefined ? 'at' : 'formula';
    reject(here, CODE.missingKey, `${what} needs a \`${missing}\``, opened.node.span);
    return null;
  }

  const at = readAs(here, anchor.value, `${what} \`at\``, RANGE);
  const formula = expectText(here, written.value, `${what} \`formula\``);
  if (at === null || formula === null) return null;

  const range = nodeAt(here, opened.path, opened.node.span);
  return { ...range, at, formula: withoutLeadingEquals(formula) };
}
