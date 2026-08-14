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
import { readDataBlocks } from './data';
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
  scalarText,
} from './read';
import { RANGE, readAs, SHEET_NAME } from './template';

/** The workbook's `sheets:` sequence, in tab order. */
export function readSheets(ctx: Ctx, node: Node, path: Path): Sheet[] {
  const seq = expectSeq(ctx, node, '`sheets`');
  if (seq === null) return [];

  const sheets: Sheet[] = [];
  for (const [index, item] of seq.items.entries()) {
    const sheet = readSheet(ctx, item, [...path, index]);
    if (sheet !== null) sheets.push(sheet);
  }
  return sheets;
}

function readSheet(ctx: Ctx, node: Node, path: Path): Sheet | null {
  const map = expectMap(ctx, node, 'a sheet');
  if (map === null) return null;

  const entries = entriesOf(ctx, map);
  const named = findEntry(entries, 'name');
  if (named === undefined) {
    reject(ctx, CODE.missingKey, 'a sheet needs a `name`', node.span);
    return null;
  }
  const name = readAs(ctx, named.value, 'a sheet `name`', SHEET_NAME);
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
    const at = [...path, key];
    switch (key) {
      case 'name':
        break;
      case 'cells':
        cells = readCells(ctx, entry.value, at);
        break;
      case 'formulas':
        formulas = readFormulaRanges(ctx, entry.value, at);
        break;
      case 'data':
        data = readDataBlocks(ctx, entry.value, at);
        break;
      case 'columns':
        columns = readColumnBands(ctx, entry.value, at);
        break;
      case 'rows':
        rows = readRowBands(ctx, entry.value, at);
        break;
      case 'merges':
        merges = readMerges(ctx, entry.value, at, what);
        break;
      default:
        opaque.push({ ...nodeAt(ctx, at, entry.span), key });
    }
  }

  return {
    ...nodeAt(ctx, path, node.span),
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
  const seq = expectSeq(ctx, node, `${what} \`merges\``);
  if (seq === null) return [];

  const merges: Merge[] = [];
  for (const [index, item] of seq.items.entries()) {
    const at = readAs(ctx, item, 'a `merges` entry', RANGE);
    if (at !== null) merges.push({ ...nodeAt(ctx, [...path, index], item.span), at });
  }
  return merges;
}

function readFormulaRanges(ctx: Ctx, node: Node, path: Path): FormulaRange[] {
  const seq = expectSeq(ctx, node, '`formulas`');
  if (seq === null) return [];

  const ranges: FormulaRange[] = [];
  for (const [index, item] of seq.items.entries()) {
    const range = readFormulaRange(ctx, item, [...path, index]);
    if (range !== null) ranges.push(range);
  }
  return ranges;
}

function readFormulaRange(ctx: Ctx, node: Node, path: Path): FormulaRange | null {
  const what = 'a `formulas` entry';
  const map = expectMap(ctx, node, what);
  if (map === null) return null;

  const entries = entriesOf(ctx, map);
  for (const entry of entries) {
    if (!MODELED_KEYS.formulaRange.has(keyOf(entry))) {
      rejectUnknownKey(ctx, entry, what, MODELED_KEYS.formulaRange);
    }
  }

  const anchor = findEntry(entries, 'at');
  const written = findEntry(entries, 'formula');
  if (anchor === undefined || written === undefined) {
    const missing = anchor === undefined ? 'at' : 'formula';
    reject(ctx, CODE.missingKey, `${what} needs a \`${missing}\``, node.span);
    return null;
  }

  const at = readAs(ctx, anchor.value, `${what} \`at\``, RANGE);
  const formula = expectText(ctx, written.value, `${what} \`formula\``);
  if (at === null || formula === null) return null;

  return { ...nodeAt(ctx, path, node.span), at, formula: withoutLeadingEquals(formula) };
}
