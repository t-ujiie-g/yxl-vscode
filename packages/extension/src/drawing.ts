import {
  type CompiledCell,
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  editabilityOf,
  reaches,
  resolve,
  type Setting,
  type StyleLayer,
  styleAt,
} from '@yxl-vscode/compile';
import type { Diagnostic } from '@yxl-vscode/diag';
import type { Evaluation } from '@yxl-vscode/evaluate';
import type { ScalarValue, SpecDoc } from '@yxl-vscode/spec';
import { addrAt, cellOf, qualified } from '@yxl-vscode/units';
import type {
  Drawing,
  DrawnCell,
  DrawnMerge,
  DrawnParam,
  DrawnSheet,
  Editable,
  MarkedCell,
  Sized,
  Uncomputed,
} from '@yxl-vscode/webview/protocol';
import { type Nodes, nodeUnder } from './inspect';

/** A compiled grid as the view is handed it: one window per sheet, the cells with anything to show (ADR-019). */
/** Where a sheet is being looked at, 1-based, as the view last asked. */
export type Window = { readonly row: number; readonly col: number };

/** The window each sheet is being looked at through, by the sheet's own name. */
export type Windows = ReadonlyMap<string, Window>;

/** How much of a sheet is drawn at once: the DOM is the cost that does not survive a hundred thousand cells (`ROADMAP.md` §9 R5). */
const WINDOW = { rows: 200, columns: 50 };

/** How far past what a spec writes a filled range is drawn: enough to see it continues. */
const BEYOND = 50;

/** The empty room drawn past what a spec writes, so the sheet is somewhere to work rather than a table of what is there. */
const ROOM = { rows: 40, columns: 6 };

export function drawn(
  file: string,
  projected: {
    doc: SpecDoc;
    grid: CompiledGrid;
    nodes: Nodes;
    diagnostics: readonly Diagnostic[];
    evaluation: Evaluation | null;
  },
  params: Setting,
  windows: Windows,
): Drawing {
  const { doc, grid, nodes, diagnostics, evaluation } = projected;
  const marked = marks(grid, nodes, diagnostics);

  return {
    kind: 'drawing',
    file,
    sheets: grid.sheets.map((sheet) =>
      drawSheet(sheet, marked.get(sheet.name) ?? [], windows.get(sheet.name), evaluation),
    ),
    params: declared(doc, params),
    diagnostics: listed(diagnostics),
    uncomputed: uncomputed(evaluation),
  };
}

/** Each diagnostic on the cells the node at its place reaches; one reaching nothing stays in the list. */
function marks(
  grid: CompiledGrid,
  nodes: Nodes,
  diagnostics: readonly Diagnostic[],
): Map<string, MarkedCell[]> {
  const marked = new Map<string, MarkedCell[]>();

  for (const problem of diagnostics) {
    const node = nodeUnder(nodes, problem.file, problem.span.start);
    if (node === null) continue;

    for (const cell of reaches(grid, node)) {
      const on = marked.get(cell.sheet) ?? [];
      on.push({ ...cellOf(cell.at), message: problem.message });
      marked.set(cell.sheet, on);
    }
  }

  return marked;
}

/** The parameters a reader may turn; a default shows as written, since that is what one would edit. */
function declared(doc: SpecDoc, params: Setting): DrawnParam[] {
  return doc.params.map((param) => ({
    name: param.name,
    value: params.get(param.name) ?? String(param.value ?? ''),
    set: params.has(param.name),
  }));
}

/** Why some cells show a formula rather than a value, for the view to say once. */
function uncomputed(evaluation: Evaluation | null): Uncomputed | null {
  if (evaluation === null) return null;
  if (evaluation.stopped) return { kind: 'tooMany', limit: evaluation.limit };

  return evaluation.unknown.length === 0 ? null : { kind: 'names', names: evaluation.unknown };
}

function drawSheet(
  sheet: CompiledSheet,
  problems: readonly MarkedCell[],
  window: Window | undefined,
  evaluation: Evaluation | null,
): DrawnSheet {
  const of = extent(sheet);
  const at = {
    row: Math.max(1, Math.min(window?.row ?? 1, Math.max(1, of.rows - WINDOW.rows + 1))),
    col: Math.max(1, Math.min(window?.col ?? 1, Math.max(1, of.columns - WINDOW.columns + 1))),
  };
  const rows = Math.min(of.rows - at.row + 1, WINDOW.rows);
  const columns = Math.min(of.columns - at.col + 1, WINDOW.columns);

  return {
    name: sheet.name,
    problems,
    rows,
    columns,
    at,
    of,
    widths: sheet.columns.map(sizedRun),
    heights: sheet.rows.map(sizedRun),
    cells: drawCells(sheet, at, rows, columns, evaluation),
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

/** How far the sheet is drawn: what it writes, a look past that into a filled range, and room to work in. */
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

  return { rows: rows + ROOM.rows, columns: columns + ROOM.columns };
}

/** Every address in the window with anything to show — a band gives an empty cell a look. */
function drawCells(
  sheet: CompiledSheet,
  at: Window,
  rows: number,
  columns: number,
  evaluation: Evaluation | null,
): DrawnCell[] {
  const drawn: DrawnCell[] = [];

  for (let row = at.row; row < at.row + rows; row += 1) {
    for (let col = at.col; col < at.col + columns; col += 1) {
      const addr = addrAt({ col, row });
      const cell = cellAt(sheet, addr);
      const layers = styleAt(sheet, addr);
      const style = resolve(layers);

      const computed = evaluation?.values.get(qualified(sheet.name, addr)) ?? null;
      const holds =
        cell !== null && (cell.value !== null || cell.formula !== null || cell.rich !== null);
      if (!holds && Object.keys(style).length === 0) continue;

      drawn.push({
        row,
        col,
        value: cell?.value ?? null,
        formula: cell?.formula ?? null,
        filledFrom: filledFrom(cell),
        rich: cell?.rich?.map((run) => ({ text: run.text, style: run.look })) ?? null,
        computed,
        overridden: cell?.provenance.value.kind === 'override',
        editable: typeable(cell),
        format: applies(layers, cell?.value ?? null, cell?.format ?? null),
        style,
      });
    }
  }

  return drawn;
}

/** Whether this cell can be typed into — `editabilityOf`'s answer, so the badge and the refusal agree. */
function typeable(cell: CompiledCell | null): Editable {
  if (cell === null) return 'mediated';

  const said = editabilityOf(cell.provenance.value);
  return said === 'readonly' ? 'mediated' : said;
}

/**
 * The number format that applies: the cell's `own` first, else the inherited one,
 * which does not reach a text cell unless it has a text section (`docs/spec.md` §4).
 */
function applies(
  layers: readonly StyleLayer[],
  value: ScalarValue,
  own: string | null,
): string | null {
  if (own !== null) return own;

  const supplying = layers.findLast((layer) => layer.gives.format !== undefined);
  if (supplying === undefined) return null;

  const inherited = supplying.through === 'column' || supplying.through === 'row';
  return inherited && typeof value === 'string' ? null : (supplying.gives.format ?? null);
}

/** The anchor of the range a cell was filled from; `null` at the anchor itself. */
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
    size: band.size ?? null,
    hidden: band.hidden ?? false,
  };
}

/** Every diagnostic as the view lists it, whether or not it reached a cell. */
export function listed(diagnostics: readonly Diagnostic[]): Drawing['diagnostics'] {
  return diagnostics.map((one) => ({
    code: one.code,
    message: one.message,
    file: one.file,
    start: one.span.start,
    end: one.span.end,
  }));
}
