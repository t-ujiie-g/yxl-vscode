import type {
  ColumnBand,
  DataBlock,
  DataRow,
  FormulaRange,
  RowBand,
  Sheet,
} from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  cellOf,
  columnsOf,
  type FilePath,
  filePath,
  parseA1Range,
  parseColumnSpan,
  parseRowSpan,
  rectOf,
  rowsOf,
  type SheetName,
  sheetName,
} from '@yxl-vscode/units';
import { address, colour, compileFacets, layer, type Spoke, spokenBy } from './cell';
import { CODE } from './codes';
import { type Ctx, filled, reject, text } from './ctx';
import type {
  CompiledBand,
  CompiledCell,
  CompiledFill,
  CompiledMerge,
  CompiledSheet,
} from './grid';
import type { FacetOrigin } from './provenance';
import { layersOf } from './style';
import { readCsv, readJson } from './table';

/** A sheet under construction, its cell map still open for the overrides that apply last. */
export interface Drafted {
  readonly sheet: CompiledSheet;
  readonly cells: Map<string, CompiledCell>;
}

/** A sheet, drawn: cells placed in the order the keys were written, since the later key wins (`docs/spec.md` §2). */
export function compileSheet(ctx: Ctx, sheet: Sheet): Drafted {
  const cells = new Map<string, CompiledCell>();
  const fills: CompiledFill[] = [];

  for (const key of sheet.keyOrder) {
    if (key === 'cells') placeCells(ctx, sheet, cells);
    if (key === 'data') for (const block of sheet.data) placeData(ctx, block, cells);
    if (key === 'formulas') for (const range of sheet.formulas) placeFill(ctx, range, fills);
  }

  return {
    sheet: {
      name: named(ctx, sheet),
      node: sheet.id,
      cells,
      fills,
      columns: sheet.columns.map((band) => columnBand(ctx, band)).filter((band) => band !== null),
      rows: sheet.rows.map((band) => rowBand(ctx, band)).filter((band) => band !== null),
      merges: sheet.merges.map((one) => mergedRegion(ctx, one)).filter((one) => one !== null),
      freeze: sheet.freeze === null ? null : address(ctx, sheet.freeze, sheet),
      visibility: sheet.visibility ?? 'visible',
      tabColor: sheet.tabColor === null ? null : colour(ctx, sheet.tabColor, sheet),
      gridlines: sheet.gridlines ?? true,
    },
    cells,
  };
}

function placeCells(ctx: Ctx, sheet: Sheet, cells: Map<string, CompiledCell>): void {
  for (const cell of sheet.cells) {
    const at = address(ctx, cell.at, cell);
    if (at === null) continue;

    const written = compileFacets(ctx, cell, at, { kind: 'literal', node: cell.id }, 'cell');
    const under = cells.get(at);
    cells.set(at, under === undefined ? written : layer(under, written, spokenBy(cell)));
  }
}

/** A field of a data block speaks of what the cell holds and of nothing else (`docs/spec.md` §9). */
const HOLDS: Spoke = { holds: true, format: false, style: false };

/** A `data:` block's rows laid down from its anchor; a `null` field writes no cell (`docs/spec.md` §9). */
function placeData(ctx: Ctx, block: DataBlock, cells: Map<string, CompiledCell>): void {
  const anchor = address(ctx, block.at, block);
  if (anchor === null) return;

  if (block.source.kind === 'inline') {
    const rows = block.source.rows.map((row) =>
      row.map((field) => filled(ctx, field, block).value),
    );
    place(cells, anchor, rows, (row, col) => ({ kind: 'inline', node: block.id, row, col }));
    return;
  }

  const opened = readTable(ctx, block, block.source);
  if (opened === null) return;

  const { file, rows } = opened;
  place(cells, anchor, rows, (row, col) => ({ kind: 'external', node: block.id, file, row, col }));
}

/** The rows a block names, read through the injected reader (ADR-004) against the opened spec (`docs/spec.md` §9). */
function readTable(
  ctx: Ctx,
  block: DataBlock,
  source: Exclude<DataBlock['source'], { kind: 'inline' }>,
): { file: FilePath; rows: readonly DataRow[] } | null {
  const spelled = text(ctx, source.path, block);
  const path = filePath(spelled);
  if (path === null) {
    reject(ctx, CODE.badPath, 'a `data` entry needs a path', block);
    return null;
  }

  if (ctx.read === null) {
    reject(ctx, CODE.noDataReader, `nothing here can read \`${path}\``, block);
    return null;
  }

  const opened = ctx.read(ctx.from, path);
  if (opened === null) {
    reject(ctx, CODE.unreadableData, `cannot read \`${path}\``, block);
    return null;
  }

  const columns = source.kind === 'json' ? source.columns : null;
  const table = source.kind === 'csv' ? readCsv(opened.source) : readJson(opened.source, columns);
  if ('problem' in table) {
    reject(ctx, CODE.badTable, `\`${opened.file}\`: ${table.problem}`, block);
    return null;
  }

  return { file: opened.file, rows: table.rows };
}

/** Rows laid down from an anchor, each field taking its origin from where it came from. */
function place(
  cells: Map<string, CompiledCell>,
  anchor: A1Addr,
  rows: readonly DataRow[],
  origin: (row: number, col: number) => FacetOrigin,
): void {
  const corner = cellOf(anchor);

  for (const [row, fields] of rows.entries()) {
    for (const [col, field] of fields.entries()) {
      if (field === null) continue;

      const at = addrAt({ col: corner.col + col, row: corner.row + row });
      const written: CompiledCell = {
        at,
        value: field,
        type: null,
        formula: null,
        format: null,
        rich: null,
        style: [],
        provenance: { value: origin(row, col), format: null },
      };

      const under = cells.get(at);
      cells.set(at, under === undefined ? written : layer(under, written, HOLDS));
    }
  }
}

function placeFill(ctx: Ctx, range: FormulaRange, fills: CompiledFill[]): void {
  const spelled = text(ctx, range.at, range);
  const read = parseA1Range(spelled);
  if (read === null) {
    reject(ctx, CODE.badRange, `\`${spelled}\` is not a range`, range);
    return;
  }

  const rect = rectOf(read);
  fills.push({
    rect,
    anchor: addrAt({ col: rect.left, row: rect.top }),
    formula: text(ctx, range.formula, range),
    node: range.id,
  });
}

/** The sheet's name with its parameters filled in; what Excel would refuse is the compiler's to say (ADR-011). */
function named(ctx: Ctx, sheet: Sheet): SheetName {
  const spelled = text(ctx, sheet.name, sheet);
  return sheetName(spelled) ?? (spelled as SheetName);
}

function columnBand(ctx: Ctx, band: ColumnBand): CompiledBand | null {
  const spelled = text(ctx, band.at, band);
  const read = parseColumnSpan(spelled);
  if (read === null) {
    reject(ctx, CODE.badColumn, `\`${spelled}\` is not a column or a range of columns`, band);
    return null;
  }

  const { first, last } = columnsOf(read);
  return {
    first,
    last,
    size: band.width,
    hidden: band.hidden,
    group: band.group,
    style: layersOf(ctx, band, 'column', band.style, band.format, band.clearsFormat),
    node: band.id,
  };
}

function rowBand(ctx: Ctx, band: RowBand): CompiledBand | null {
  const spelled = text(ctx, band.at, band);
  const read = parseRowSpan(spelled);
  if (read === null) {
    reject(ctx, CODE.badRow, `\`${spelled}\` is not a row or a range of rows`, band);
    return null;
  }

  const { first, last } = rowsOf(read);
  return {
    first,
    last,
    size: band.height,
    hidden: band.hidden,
    group: band.group,
    style: layersOf(ctx, band, 'row', band.style, band.format, band.clearsFormat),
    node: band.id,
  };
}

function mergedRegion(ctx: Ctx, merge: Sheet['merges'][number]): CompiledMerge | null {
  const spelled = text(ctx, merge.at, merge);
  const read = parseA1Range(spelled);
  if (read === null) {
    reject(ctx, CODE.badRange, `\`${spelled}\` is not a range`, merge);
    return null;
  }
  return { rect: rectOf(read), node: merge.id };
}
