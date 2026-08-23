import type { Node, Path } from '@yxl-vscode/cst';
import {
  type Cell,
  type ColumnBand,
  type Conditional,
  type DataBlock,
  type FormulaRange,
  type Merge,
  MODELED_KEYS,
  type Opaque,
  type RowBand,
  type Sheet,
  type Split,
} from '@yxl-vscode/spec';
import { readColumnBands, readRowBands } from './band';
import { readCells, withoutLeadingEquals } from './cell';
import { CODE } from './codes';
import { readConditional } from './conditional';
import { type Ctx, identify, keyOf, reject, type Site } from './ctx';
import { readDataBlocks } from './data';
import {
  expectBool,
  expectNumber,
  expectSpelling,
  expectText,
  findEntry,
  openEntries,
  readEach,
  rejectUnknownKey,
  scalarText,
} from './read';
import { ADDRESS, COLOR, RANGE, readAs, SHEET_NAME } from './template';

/** The workbook's `sheets:` sequence, in tab order. */
export function readSheets(ctx: Ctx, node: Node, path: Path): Sheet[] {
  return readEach(ctx, node, path, '`sheets`', readSheet);
}

function readSheet(site: Site): Sheet | null {
  const opened = openEntries(site.ctx, site.node, site.path, 'a sheet');
  if (opened === null) return null;

  const here = opened.ctx;
  const { entries } = opened;

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
  let freeze: Sheet['freeze'] = null;
  let visibility: Sheet['visibility'] = null;
  let tabColor: Sheet['tabColor'] = null;
  let gridlines: Sheet['gridlines'] = null;
  let split: Sheet['split'] = null;
  let conditional: Conditional[] = [];
  let filter: Sheet['filter'] = null;
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
      case 'freeze':
        freeze = readAs(here, entry.value, `${what} \`freeze\``, ADDRESS);
        break;
      case 'visibility':
        visibility = expectSpelling(here, entry.value, `${what} \`visibility\``, SHOWN);
        break;
      case 'tab_color':
        tabColor = readAs(here, entry.value, `${what} \`tab_color\``, COLOR);
        break;
      case 'gridlines':
        gridlines = expectBool(here, entry.value, `${what} \`gridlines\``);
        break;
      case 'split':
        split = readSplit(here, entry.value, `${what} \`split\``);
        break;
      case 'conditional':
        conditional = readConditional(here, entry.value, at);
        break;
      case 'filter':
        filter = readAs(here, entry.value, `${what} \`filter\``, RANGE);
        break;
      default:
        opaque.push({ ...identify(here, at, entry.span), key });
    }
  }

  return {
    ...identify(here, opened.path, opened.node.span),
    name,
    cells,
    formulas,
    data,
    columns,
    rows,
    merges,
    freeze,
    visibility,
    tabColor,
    gridlines,
    split,
    conditional,
    filter,
    keyOrder: entries.map(keyOf),
    opaque,
  };
}

/** A `split:` mapping, in points from the top-left; a missing axis is `0`, which is unsplit. */
function readSplit(ctx: Ctx, node: Node, what: string): Split | null {
  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;

  const read = (key: 'x' | 'y'): number | null => {
    const found = findEntry(opened.entries, key);
    return found === undefined ? 0 : expectNumber(ctx, found.value, `${what} \`${key}\``);
  };

  const x = read('x');
  const y = read('y');
  return x === null || y === null ? null : { x, y };
}

/** The spellings `visibility` takes (`docs/spec.md` §2). */
const SHOWN = ['visible', 'hidden', 'very_hidden'] as const;

function readMerges(ctx: Ctx, node: Node, path: Path, what: string): Merge[] {
  return readEach(ctx, node, path, `${what} \`merges\``, (site) => {
    const at = readAs(site.ctx, site.node, 'a `merges` entry', RANGE);
    return at === null ? null : { ...identify(site.ctx, site.path, site.node.span), at };
  });
}

function readFormulaRanges(ctx: Ctx, node: Node, path: Path): FormulaRange[] {
  return readEach(ctx, node, path, '`formulas`', readFormulaRange);
}

function readFormulaRange(site: Site): FormulaRange | null {
  const what = 'a `formulas` entry';
  const opened = openEntries(site.ctx, site.node, site.path, what);
  if (opened === null) return null;

  const here = opened.ctx;
  const { entries } = opened;
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

  const range = identify(here, opened.path, opened.node.span);
  return { ...range, at, formula: withoutLeadingEquals(formula) };
}
