import {
  type CompiledCell,
  type CompiledSheet,
  cellAt,
  compile,
  type DataReader,
  resolve,
  styleAt,
} from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import type { Diagnostic } from '@yxl-vscode/diag';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { addrAt, cellOf } from '@yxl-vscode/units';
import type {
  Drawing,
  DrawnCell,
  DrawnMerge,
  DrawnSheet,
  Sized,
} from '@yxl-vscode/webview/protocol';

/**
 * How far past what a spec writes a filled range is drawn.
 *
 * `at: D2:D1048576` is a legal thing to write and the whole point of the
 * construct; drawing it out would be a million rows of nothing. The written
 * content is what the reader is looking at, and this is enough beyond it to see
 * that the range continues. Virtualizing instead is §9 R5's business.
 */
const BEYOND = 50;

/** A spec, read and drawn — and everything that could not be, said once. */
export interface Projected {
  readonly drawing: Drawing;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * The whole pipeline, as one function over text: parse, load, compile, flatten.
 *
 * Kept apart from anything VS Code so that it is ordinary to test and ordinary
 * to reason about — the host below it only decides *when* to call this and
 * where to put what comes back.
 */
export function project(text: string, file: string, read: IncludeReader & DataReader): Projected {
  const parsed = parse(text, { file });
  const loaded = load(parsed, read);
  if (loaded.doc === null) {
    const diagnostics = [...parsed.diagnostics, ...loaded.diagnostics];
    return {
      drawing: { kind: 'drawing', file, sheets: [], diagnostics: listed(diagnostics) },
      diagnostics,
    };
  }

  const grid = compile(loaded.doc, read);
  const diagnostics = [...parsed.diagnostics, ...loaded.diagnostics, ...grid.diagnostics];

  return {
    drawing: {
      kind: 'drawing',
      file,
      sheets: grid.sheets.map(drawSheet),
      diagnostics: listed(diagnostics),
    },
    diagnostics,
  };
}

function drawSheet(sheet: CompiledSheet): DrawnSheet {
  const { rows, columns } = extent(sheet);

  return {
    name: sheet.name,
    rows,
    columns,
    widths: sheet.columns.map(sizedRun),
    heights: sheet.rows.map(sizedRun),
    cells: drawCells(sheet, rows, columns),
    merges: sheet.merges.map(
      (merge): DrawnMerge => ({
        top: merge.rect.top,
        left: merge.rect.left,
        bottom: merge.rect.bottom,
        right: merge.rect.right,
      }),
    ),
  };
}

/**
 * How far the sheet is drawn: what it writes, and a look past that at what a
 * filled range continues into.
 */
function extent(sheet: CompiledSheet): { rows: number; columns: number } {
  let rows = 0;
  let columns = 0;

  for (const cell of sheet.cells.values()) {
    const { col, row } = cellOf(cell.at);
    rows = Math.max(rows, row);
    columns = Math.max(columns, col);
  }

  for (const merge of sheet.merges) {
    rows = Math.max(rows, merge.rect.bottom);
    columns = Math.max(columns, merge.rect.right);
  }

  for (const fill of sheet.fills) {
    rows = Math.max(rows, Math.min(fill.rect.bottom, rows + BEYOND));
    columns = Math.max(columns, fill.rect.right);
  }

  return { rows, columns };
}

/**
 * Every address in the drawn box that has anything to show.
 *
 * A band gives an empty cell a look, so this asks about addresses nothing
 * wrote — and skips the ones that come back with nothing, which is most of a
 * grid.
 */
function drawCells(sheet: CompiledSheet, rows: number, columns: number): DrawnCell[] {
  const drawn: DrawnCell[] = [];

  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= columns; col += 1) {
      const at = addrAt({ col, row });
      const cell = cellAt(sheet, at);
      const style = resolve(styleAt(sheet, at));

      const holds = cell !== null && (cell.value !== null || cell.formula !== null);
      if (!holds && Object.keys(style).length === 0) continue;

      drawn.push({
        row,
        col,
        value: cell?.value ?? null,
        formula: cell?.formula ?? null,
        filledFrom: filledFrom(cell),
        style,
      });
    }
  }

  return drawn;
}

/**
 * The anchor of the range a cell was filled from, and `null` at the anchor
 * itself — where the formula is written as it applies.
 */
function filledFrom(cell: CompiledCell | null): string | null {
  const origin = cell?.provenance.value;
  if (origin?.kind !== 'formulaRange') return null;

  const [across, down] = origin.offset;
  return across === 0 && down === 0 ? null : origin.anchor;
}

function sizedRun(band: CompiledSheet['columns'][number]): Sized {
  return {
    first: band.first,
    last: band.last,
    size: band.size ?? 0,
    hidden: band.hidden ?? false,
  };
}

function listed(diagnostics: readonly Diagnostic[]): Drawing['diagnostics'] {
  return diagnostics.map((one) => ({ code: one.code, message: one.message, file: one.file }));
}
