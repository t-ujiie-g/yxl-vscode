import {
  type ColumnBand,
  type Conditional,
  type DataBlock,
  type DataRow,
  ERROR_STYLES,
  type FormulaRange,
  type Link,
  type Note,
  type RowBand,
  type Sheet,
  type Table,
  type Validation,
  VISIBILITIES,
  type Visibility,
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
  type Rect,
  rectOf,
  rowsOf,
  type SheetName,
  sheetName,
} from '@yxl-vscode/units';
import {
  address,
  colour,
  compileFacets,
  decides,
  layer,
  type Spoke,
  spelling,
  spokenBy,
} from './cell';
import { CODE } from './codes';
import { type Ctx, filled, reject, text } from './ctx';
import { chart, image, shape, sparklines } from './float';
import type {
  CompiledAsk,
  CompiledBand,
  CompiledCell,
  CompiledFill,
  CompiledLayout,
  CompiledLink,
  CompiledMerge,
  CompiledNote,
  CompiledRule,
  CompiledSheet,
  CompiledTable,
  CompiledValidation,
} from './grid';
import { anchored, covered, draw, readRange } from './layout';
import { printing } from './print';
import { protecting } from './protect';
import type { FacetOrigin } from './provenance';
import { layersOf } from './style';
import { readCsv, readJson } from './table';
import { say } from './text';

/** A sheet under construction, its cell map still open for the overrides that apply last. */
export interface Drafted {
  readonly sheet: CompiledSheet;
  readonly cells: Map<string, CompiledCell>;
}

/** A sheet, drawn: cells placed in the order the keys were written, since the later key wins (`docs/spec.md` §2). */
export function compileSheet(ctx: Ctx, sheet: Sheet): Drafted {
  const name = named(ctx, sheet);
  const cells = new Map<string, CompiledCell>();
  const fills: CompiledFill[] = [];
  const columns: CompiledBand[] = [];
  const merges: CompiledMerge[] = [];
  const conditional: CompiledRule[] = [];
  const layouts: CompiledLayout[] = [];

  for (const key of sheet.keyOrder) {
    if (key === 'cells') placeCells(ctx, sheet, cells);
    if (key === 'data') for (const block of sheet.data) placeData(ctx, block, cells, name);
    if (key === 'formulas') for (const range of sheet.formulas) placeFill(ctx, range, fills);
    if (key === 'columns') columns.push(...kept(sheet.columns, (band) => columnBand(ctx, band)));
    if (key === 'merges') merges.push(...kept(sheet.merges, (one) => mergedRegion(ctx, one)));
    if (key === 'conditional') {
      conditional.push(...kept(sheet.conditional, (rule) => conditionalRule(ctx, rule, name)));
    }
    if (key !== 'layouts') continue;

    for (const layout of sheet.layouts) {
      const placed = ctx.placed.get(layout.id);
      if (placed === undefined) continue;

      const drawn = draw(ctx, placed);
      for (const cell of drawn.cells) {
        const under = cells.get(cell.at);
        cells.set(cell.at, under === undefined ? cell : layer(under, cell, DRAWS));
      }
      fills.push(...drawn.fills);
      columns.push(...drawn.bands);
      merges.push(...drawn.merges);
      conditional.push(...drawn.rules);
      layouts.push(drawn.layout);
    }
  }

  return {
    sheet: {
      name,
      node: sheet.id,
      cells,
      fills,
      columns,
      rows: sheet.rows.map((band) => rowBand(ctx, band)).filter((band) => band !== null),
      merges,
      freeze: sheet.freeze === null ? null : address(ctx, sheet.freeze, sheet),
      visibility: shown(ctx, sheet),
      tabColor: sheet.tabColor === null ? null : colour(ctx, sheet.tabColor, sheet),
      gridlines: sheet.gridlines ?? true,
      split: sheet.split,
      filter: filterOf(ctx, sheet),
      print: sheet.print === null ? null : printing(ctx, sheet.print),
      protect: sheet.protect === null ? null : protecting(sheet.protect),
      notes: notesOf(ctx, sheet.comments),
      links: linksOf(ctx, sheet.links),
      validations: kept(sheet.validations, (one) => validation(ctx, one, name)),
      tables: kept(sheet.tables, (one) => table(ctx, one, name)),
      charts: kept(sheet.charts, (one) => chart(ctx, one, name)),
      images: kept(sheet.images, (one) => image(ctx, one, name)),
      shapes: kept(sheet.shapes, (one) => shape(ctx, one, name)),
      sparklines: sheet.sparklines.flatMap((group) => sparklines(ctx, group)),
      conditional,
      layouts,
      carried: sheet.opaque,
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

/** What survived reading, in the order written; what did not was reported where it was read. */
function kept<T, U>(written: readonly T[], read: (one: T) => U | null): U[] {
  return written.map(read).filter((one): one is U => one !== null);
}

/** A field of a data block speaks of what the cell holds and of nothing else (`docs/spec.md` §9). */
const HOLDS: Spoke = { holds: true, format: false, style: false };

/** A layout writes a cell as the hand-written key would: what it holds, and the look laid over what was there. */
const DRAWS: Spoke = { holds: true, format: false, style: true };

/** A `data:` block's rows laid down from its anchor; a `null` field writes no cell (`docs/spec.md` §9). */
function placeData(
  ctx: Ctx,
  block: DataBlock,
  cells: Map<string, CompiledCell>,
  sheet: SheetName,
): void {
  const anchor = anchored(ctx, block.at, block, sheet);
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
    reject(ctx, CODE.badPath, say('compile.data-needs-a-path'), block);
    return null;
  }

  if (ctx.read === null) {
    reject(ctx, CODE.noDataReader, say('compile.nothing-can-read', { path }), block);
    return null;
  }

  const opened = ctx.read(ctx.from, path);
  if (opened === null) {
    reject(ctx, CODE.unreadableData, say('compile.cannot-read', { path }), block);
    return null;
  }

  const columns = source.kind === 'json' ? source.columns : null;
  const table = source.kind === 'csv' ? readCsv(opened.source) : readJson(opened.source, columns);
  if ('problem' in table) {
    reject(
      ctx,
      CODE.badTable,
      say('compile.bad-table', { file: opened.file, problem: table.problem }),
      block,
    );
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
    reject(ctx, CODE.badRange, say('compile.not-a-range', { spelled }), range);
    return;
  }

  const rect = rectOf(read);
  fills.push({
    rect,
    anchor: addrAt({ col: rect.left, row: rect.top }),
    formula: text(ctx, range.formula, range),
    node: range.id,
    layout: null,
  });
}

/** The sheet's name with its parameters filled in; what Excel would refuse is the compiler's to say (ADR-011). */
export function named(ctx: Ctx, sheet: Sheet): SheetName {
  const spelled = text(ctx, sheet.name, sheet);
  return sheetName(spelled) ?? (spelled as SheetName);
}

/** Whether Excel shows the tab; a sheet that says nothing is shown (`docs/spec.md` §2). */
function shown(ctx: Ctx, sheet: Sheet): Visibility {
  if (sheet.visibility === null) return 'visible';
  return spelling(ctx, sheet.visibility, VISIBILITIES, sheet) ?? 'visible';
}

function columnBand(ctx: Ctx, band: ColumnBand): CompiledBand | null {
  const spelled = text(ctx, band.at, band);
  const read = parseColumnSpan(spelled);
  if (read === null) {
    reject(ctx, CODE.badColumn, say('compile.not-a-column', { spelled }), band);
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
    reject(ctx, CODE.badRow, say('compile.not-a-row', { spelled }), band);
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
    reject(ctx, CODE.badRange, say('compile.not-a-range', { spelled }), merge);
    return null;
  }
  return { rect: rectOf(read), node: merge.id };
}

/** One `conditional:` rule, its range read and its look resolved (`docs/spec.md` §10). */
function conditionalRule(ctx: Ctx, rule: Conditional, sheet: SheetName): CompiledRule | null {
  const rect = covered(ctx, rule.at, rule, sheet);
  if (rect === null) return null;

  const test = decides(ctx, rule);
  if (test === null) return null;

  return {
    rect,
    test,
    style: layersOf(ctx, rule, 'conditional', rule.style, rule.format),
    stopIfTrue: rule.stopIfTrue,
    node: rule.id,
  };
}

/** Each note by the address it sits on; the later of two notes on one cell is the one Excel keeps. */
function notesOf(ctx: Ctx, comments: readonly Note[]): Map<string, CompiledNote> {
  const notes = new Map<string, CompiledNote>();

  for (const note of comments) {
    const at = address(ctx, note.at, note);
    if (at === null) continue;

    notes.set(at, {
      at,
      text: text(ctx, note.text, note),
      author: note.author === null ? null : text(ctx, note.author, note),
      node: note.id,
    });
  }

  return notes;
}

/** One `validations:` entry, its range read and its `from:` split into the sheet it names. */
function validation(ctx: Ctx, one: Validation, sheet: SheetName): CompiledValidation | null {
  const rect = covered(ctx, one.at, one, sheet);
  if (rect === null) return null;

  const asks = asking(ctx, one);
  if (asks === null) return null;

  return {
    rect,
    asks,
    allowBlank: one.allowBlank,
    prompt: one.prompt,
    error: refusal(ctx, one),
    node: one.id,
  };
}

/** How Excel refuses a value, after a parameter has had its say; `stop` where it cannot be read (`docs/spec.md` §10). */
function refusal(ctx: Ctx, one: Validation): CompiledValidation['error'] {
  if (one.error === null) return null;
  return { ...one.error, style: spelling(ctx, one.error.style, ERROR_STYLES, one) ?? 'stop' };
}

/** What it asks, with a `from:` read as a range and the sheet it names, if it names one. */
function asking(ctx: Ctx, one: Validation): CompiledAsk | null {
  const test = one.test;
  if (test.kind !== 'listFrom') return test;

  const read = readRange(ctx, text(ctx, test.from, one), one);
  return read === null ? null : { kind: 'listFrom', ...read };
}

/** Each link by the address it sits on; the later of two links on one cell is the one Excel keeps. */
function linksOf(ctx: Ctx, links: readonly Link[]): Map<string, CompiledLink> {
  const drawn = new Map<string, CompiledLink>();

  for (const link of links) {
    const at = address(ctx, link.at, link);
    if (at === null) continue;

    drawn.set(at, {
      at,
      target: { kind: link.target.kind, text: text(ctx, link.target.text, link) },
      tip: link.tip === null ? null : text(ctx, link.tip, link),
      node: link.id,
    });
  }

  return drawn;
}

/** One `tables:` entry, its range read; the top row of it names the columns (`docs/spec.md` §11). */
function table(ctx: Ctx, one: Table, sheet: SheetName): CompiledTable | null {
  const rect = covered(ctx, one.at, one, sheet);
  if (rect === null) return null;

  return {
    rect,
    name: one.name === null ? null : text(ctx, one.name, one),
    style: one.style === null ? null : text(ctx, one.style, one),
    bandedRows: one.bandedRows,
    bandedColumns: one.bandedColumns,
    firstColumn: one.firstColumn,
    lastColumn: one.lastColumn,
    node: one.id,
  };
}

/** The header row a sheet hangs its filter off, as the range it is written as (`docs/spec.md` §10). */
function filterOf(ctx: Ctx, sheet: Sheet): Rect | null {
  if (sheet.filter === null) return null;

  const spelled = text(ctx, sheet.filter, sheet);
  const read = parseA1Range(spelled);
  if (read === null) {
    reject(ctx, CODE.badRange, say('compile.not-a-range', { spelled }), sheet);
    return null;
  }

  return rectOf(read);
}
