import {
  type CompiledCell,
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  compile,
  type DataReader,
  reaches,
  resolve,
  type Setting,
  type StyleLayer,
  styleAt,
} from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import type { Diagnostic } from '@yxl-vscode/diag';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import type { ScalarValue, SpecDoc } from '@yxl-vscode/spec';
import { addrAt, cellOf } from '@yxl-vscode/units';
import type {
  Drawing,
  DrawnCell,
  DrawnMerge,
  DrawnParam,
  DrawnSheet,
  MarkedCell,
  Sized,
} from '@yxl-vscode/webview/protocol';
import { type Nodes, nodeAt, nodesOf } from './inspect';

/**
 * How far past what a spec writes a filled range is drawn.
 *
 * `at: D2:D1048576` is a legal thing to write and the whole point of the
 * construct; drawing it out would be a million rows of nothing. The written
 * content is what the reader is looking at, and this is enough beyond it to see
 * that the range continues. Virtualizing instead is §9 R5's business.
 */
const BEYOND = 50;

/**
 * A spec, read and drawn — and everything that could not be, said once.
 *
 * The `doc` and the `grid` come back too: the drawing is what the view needs,
 * and a question about *why* a cell looks the way it does is answered from
 * these. Recomputing them per question would be the same work done twice.
 */
export interface Projected {
  readonly drawing: Drawing;
  readonly diagnostics: readonly Diagnostic[];
  readonly doc: SpecDoc | null;
  readonly grid: CompiledGrid | null;
  readonly nodes: Nodes;
}

/**
 * The whole pipeline, as one function over text: parse, load, compile, flatten.
 *
 * Kept apart from anything VS Code so that it is ordinary to test and ordinary
 * to reason about — the host below it only decides *when* to call this and
 * where to put what comes back.
 */
export function project(
  text: string,
  file: string,
  read: IncludeReader & DataReader,
  params: Setting = new Map(),
): Projected {
  const parsed = parse(text, { file });
  const loaded = load(parsed, read);
  if (loaded.doc === null) {
    const diagnostics = [...parsed.diagnostics, ...loaded.diagnostics];
    return {
      drawing: { kind: 'drawing', file, sheets: [], params: [], diagnostics: listed(diagnostics) },
      diagnostics,
      doc: null,
      grid: null,
      nodes: new Map(),
    };
  }

  const grid = compile(loaded.doc, { read, params });
  const diagnostics = [...parsed.diagnostics, ...loaded.diagnostics, ...grid.diagnostics];
  const nodes = nodesOf(loaded.doc);
  const marked = marks(grid, nodes, diagnostics);

  return {
    drawing: {
      kind: 'drawing',
      file,
      sheets: grid.sheets.map((sheet) => drawSheet(sheet, marked.get(sheet.name) ?? [])),
      params: declared(loaded.doc, params),
      diagnostics: listed(diagnostics),
    },
    diagnostics,
    doc: loaded.doc,
    grid,
    nodes,
  };
}

/**
 * Each diagnostic on the cells it is about, by sheet.
 *
 * A diagnostic names a place in a file; the node at that place is what a reader
 * would call the cause, and the cells it reaches are where the effect shows.
 * One that reaches nothing — a sheet with no name, a band with an unreadable
 * `at` — is left to the list under the grid, which is where it belongs.
 */
function marks(
  grid: CompiledGrid,
  nodes: Nodes,
  diagnostics: readonly Diagnostic[],
): Map<string, MarkedCell[]> {
  const marked = new Map<string, MarkedCell[]>();

  for (const problem of diagnostics) {
    const node = nodeAt(nodes, problem.file, problem.span.start);
    if (node === null) continue;

    for (const cell of reaches(grid, node)) {
      const on = marked.get(cell.sheet) ?? [];
      on.push({ ...cellOf(cell.at), message: problem.message });
      marked.set(cell.sheet, on);
    }
  }

  return marked;
}

/**
 * The parameters a reader may turn, with what they are set to now.
 *
 * A default that names another parameter shows as the text the spec wrote,
 * since that is what a reader would edit — the resolved value is on the cells.
 */
function declared(doc: SpecDoc, params: Setting): DrawnParam[] {
  return doc.params.map((param) => ({
    name: param.name,
    value: params.get(param.name) ?? String(param.value ?? ''),
    set: params.has(param.name),
  }));
}

function drawSheet(sheet: CompiledSheet, problems: readonly MarkedCell[]): DrawnSheet {
  const { rows, columns } = extent(sheet);

  return {
    name: sheet.name,
    problems,
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
      const layers = styleAt(sheet, at);
      const style = resolve(layers);

      const holds = cell !== null && (cell.value !== null || cell.formula !== null);
      if (!holds && Object.keys(style).length === 0) continue;

      drawn.push({
        row,
        col,
        value: cell?.value ?? null,
        formula: cell?.formula ?? null,
        filledFrom: filledFrom(cell),
        format: applies(layers, cell?.value ?? null),
        style,
      });
    }
  }

  return drawn;
}

/**
 * The number format that actually applies to this cell.
 *
 * Excel's own rule, not yxl's: **an inherited number format does not apply to a
 * text cell** (`docs/spec.md` §4). A code with fewer than four sections says
 * nothing about text, so a band's `#,##0` leaves a heading alone — while a
 * `format:` written on the cell itself is a request and is always honoured.
 */
function applies(layers: readonly StyleLayer[], value: ScalarValue): string | null {
  const supplying = layers.findLast((layer) => layer.gives.format !== undefined);
  if (supplying === undefined) return null;

  const inherited = supplying.through === 'column' || supplying.through === 'row';
  return inherited && typeof value === 'string' ? null : (supplying.gives.format ?? null);
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
  return diagnostics.map((one) => ({
    code: one.code,
    message: one.message,
    file: one.file,
    start: one.span.start,
    end: one.span.end,
  }));
}
