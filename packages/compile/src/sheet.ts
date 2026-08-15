import type { ColumnBand, DataBlock, FormulaRange, RowBand, Sheet } from '@yxl-vscode/spec';
import {
  addrAt,
  cellOf,
  columnsOf,
  parseA1Range,
  parseColumnSpan,
  parseRowSpan,
  rectOf,
  rowsOf,
} from '@yxl-vscode/units';
import { address, compileFacets } from './cell';
import { CODE } from './codes';
import { type Ctx, filled, filledText, reject } from './ctx';
import type {
  CompiledBand,
  CompiledCell,
  CompiledFill,
  CompiledMerge,
  CompiledSheet,
} from './grid';

/**
 * A sheet under construction: the compiled form, and the cell map still open
 * for the overrides that apply after everything else has written.
 */
export interface Drafted {
  readonly sheet: CompiledSheet;
  readonly cells: Map<string, CompiledCell>;
}

/**
 * A sheet, drawn.
 *
 * The written cells are placed in the order the sheet's keys were written,
 * because that is the order they apply in (`docs/spec.md` §2): where a `data:`
 * block and a `cells:` entry reach the same address, whichever came later wins.
 */
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
      name: String(filledText(ctx, sheet.name, sheet).value),
      node: sheet.id,
      cells,
      fills,
      columns: sheet.columns.map((band) => columnBand(ctx, band)).filter((band) => band !== null),
      rows: sheet.rows.map((band) => rowBand(ctx, band)).filter((band) => band !== null),
      merges: sheet.merges.map((one) => mergedRegion(ctx, one)).filter((one) => one !== null),
    },
    cells,
  };
}

function placeCells(ctx: Ctx, sheet: Sheet, cells: Map<string, CompiledCell>): void {
  for (const cell of sheet.cells) {
    const at = address(ctx, cell.at, cell);
    if (at !== null)
      cells.set(at, compileFacets(ctx, cell, at, { kind: 'literal', node: cell.id }));
  }
}

/**
 * A `data:` block's rows, laid down from its anchor.
 *
 * A `null` field and a row that stops short both write no cell — which is what
 * leaves room for a `formulas:` range to fill the gap (`docs/spec.md` §9).
 */
function placeData(ctx: Ctx, block: DataBlock, cells: Map<string, CompiledCell>): void {
  const anchor = address(ctx, block.at, block);
  if (anchor === null) return;

  if (block.source.kind !== 'inline') {
    const path = String(filledText(ctx, block.source.path, block).value);
    const message = `this preview does not read \`${path}\` yet`;
    reject(ctx, CODE.notReadYet, message, block);
    return;
  }

  const corner = cellOf(anchor);
  for (const [row, fields] of block.source.rows.entries()) {
    for (const [col, field] of fields.entries()) {
      if (field === null) continue;

      const at = addrAt({ col: corner.col + col, row: corner.row + row });
      cells.set(at, {
        at,
        value: filled(ctx, field, block).value,
        type: null,
        formula: null,
        format: null,
        rich: null,
        provenance: { value: { kind: 'inline', node: block.id, row, col }, format: null },
      });
    }
  }
}

function placeFill(ctx: Ctx, range: FormulaRange, fills: CompiledFill[]): void {
  const text = String(filledText(ctx, range.at, range).value);
  const read = parseA1Range(text);
  if (read === null) {
    reject(ctx, CODE.badRange, `\`${text}\` is not a range`, range);
    return;
  }

  const rect = rectOf(read);
  fills.push({
    rect,
    anchor: addrAt({ col: rect.left, row: rect.top }),
    formula: String(filled(ctx, range.formula, range).value),
    node: range.id,
  });
}

function columnBand(ctx: Ctx, band: ColumnBand): CompiledBand | null {
  const text = String(filledText(ctx, band.at, band).value);
  const read = parseColumnSpan(text);
  if (read === null) {
    reject(ctx, CODE.badColumn, `\`${text}\` is not a column or a range of columns`, band);
    return null;
  }

  const { first, last } = columnsOf(read);
  return { first, last, size: band.width, hidden: band.hidden, group: band.group, node: band.id };
}

function rowBand(ctx: Ctx, band: RowBand): CompiledBand | null {
  const text = String(filledText(ctx, band.at, band).value);
  const read = parseRowSpan(text);
  if (read === null) {
    reject(ctx, CODE.badRow, `\`${text}\` is not a row or a range of rows`, band);
    return null;
  }

  const { first, last } = rowsOf(read);
  return { first, last, size: band.height, hidden: band.hidden, group: band.group, node: band.id };
}

function mergedRegion(ctx: Ctx, merge: Sheet['merges'][number]): CompiledMerge | null {
  const text = String(filledText(ctx, merge.at, merge).value);
  const read = parseA1Range(text);
  if (read === null) {
    reject(ctx, CODE.badRange, `\`${text}\` is not a range`, merge);
    return null;
  }
  return { rect: rectOf(read), node: merge.id };
}
