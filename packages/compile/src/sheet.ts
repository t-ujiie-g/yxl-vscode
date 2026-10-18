import {
  type ByMeaning,
  type ColumnBand,
  type Conditional,
  ERROR_STYLES,
  type Filter,
  type FormulaRange,
  type Link,
  type Note,
  type RowBand,
  type Sheet,
  type SpecNode,
  type Table,
  type Templated,
  type Validation,
  VISIBILITIES,
  type Visibility,
} from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  cellOf,
  columnsOf,
  type NodeId,
  overlapping,
  parseA1Range,
  parseColumnSpan,
  parseRowSpan,
  type Rect,
  rangeOf,
  rectOf,
  rowsOf,
  type SheetName,
  sheetName,
  sheetPrefix,
  within,
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
import { type Ctx, declaredSheet, reject, text } from './ctx';
import { placeData } from './data';
import { draw } from './drawing';
import { chart, image, shape, sparklines } from './float';
import type {
  CompiledAsk,
  CompiledBand,
  CompiledBlock,
  CompiledCell,
  CompiledFill,
  CompiledFilter,
  CompiledLayout,
  CompiledLink,
  CompiledMerge,
  CompiledNote,
  CompiledRule,
  CompiledSheet,
  CompiledTable,
  CompiledValidation,
} from './grid';
import { byMeaning, covered, layoutHere, partRows, readRange, tableOf } from './named';
import { colOf, edges, type Placed } from './placed';
import { printing } from './print';
import { protecting } from './protect';
import { layersOf } from './style';
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
  const blocks: CompiledBlock[] = [];
  const columns: CompiledBand[] = [];
  const merges: CompiledMerge[] = [];
  const conditional: CompiledRule[] = [];
  const layouts: CompiledLayout[] = [];
  const written = new Map<CompiledFill, SpecNode>();

  for (const key of sheet.keyOrder) {
    if (key === 'cells') placeCells(ctx, sheet, cells);
    if (key === 'data') {
      for (const block of sheet.data) {
        const placed = placeData(ctx, block, cells, name);
        if (placed !== null) blocks.push(placed);
      }
    }
    if (key === 'formulas') {
      for (const range of sheet.formulas) {
        const fill = placeFill(ctx, range);
        if (fill === null) continue;
        fills.push(fill);
        written.set(fill, range);
      }
    }
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
      for (const fill of drawn.fills) written.set(fill, layout);
      columns.push(...drawn.bands);
      merges.push(...drawn.merges);
      conditional.push(...drawn.rules);
      layouts.push(drawn.layout);
    }
  }

  clashes(ctx, written, cells);

  return {
    sheet: {
      name,
      node: sheet.id,
      cells,
      fills,
      blocks,
      columns,
      rows: sheet.rows.map((band) => rowBand(ctx, band, name)).filter((band) => band !== null),
      merges,
      freeze: frozenAt(ctx, sheet, name),
      visibility: shown(ctx, sheet),
      tabColor: sheet.tabColor === null ? null : colour(ctx, sheet.tabColor, sheet),
      gridlines: sheet.gridlines ?? true,
      split: sheet.split,
      filter: filterOf(ctx, sheet, name),
      print: printing(ctx, sheet.print, name, breaksOf(ctx, sheet)),
      protect: sheet.protect === null ? null : protecting(sheet.protect),
      notes: notesOf(ctx, sheet.comments, name),
      links: linksOf(ctx, sheet.links, name),
      validations: kept(sheet.validations, (one) => validation(ctx, one, name)),
      tables: kept(sheet.tables, (one) => table(ctx, one, name)),
      charts: kept(sheet.charts, (one) => chart(ctx, one, name)),
      images: kept(sheet.images, (one) => image(ctx, one, name)),
      shapes: kept(sheet.shapes, (one) => shape(ctx, one, name)),
      sparklines: sheet.sparklines.flatMap((group) => sparklines(ctx, group)),
      conditional,
      layouts,
      carried: sheet.opaque,
      date1904: ctx.from1904,
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

/** A layout writes a cell as the hand-written key would: what it holds, and the look laid over what was there. */
const DRAWS: Spoke = { holds: true, format: false, style: true };

function placeFill(ctx: Ctx, range: FormulaRange): CompiledFill | null {
  const spelled = text(ctx, range.at, range);
  const read = parseA1Range(spelled);
  if (read === null) {
    reject(ctx, CODE.badRange, say('compile.not-a-range', { spelled }), range);
    return null;
  }

  const rect = rectOf(read);
  return {
    rect,
    anchor: addrAt({ col: rect.left, row: rect.top }),
    formula: text(ctx, range.formula, range),
    style: layersOf(ctx, range, 'cell', range.style, range.format, range.clearsFormat),
    node: range.id,
    layout: null,
  };
}

/** Where the panes freeze: a cell, or above a named layout's body and through its first `columns` (`docs/spec.md` §25). */
function frozenAt(ctx: Ctx, sheet: Sheet, name: SheetName): A1Addr | null {
  const at = sheet.freeze;
  if (at === null) return null;
  if (typeof at === 'string' || at.kind === 'template') return address(ctx, at, sheet);

  const placed = layoutHere(ctx, at.layout, name, sheet);
  if (placed === null) return null;

  const count = placed.columns.length;
  if (!Number.isInteger(at.columns) || at.columns < 0 || at.columns > count) {
    reject(
      ctx,
      CODE.badLayout,
      say('compile.freeze-columns', { columns: at.columns, count }),
      sheet,
    );
    return null;
  }

  const col = at.columns === 0 ? 1 : edges(placed).left + at.columns;
  if (col === 1 && placed.bodyFirst === 1) {
    reject(ctx, CODE.badLayout, say('compile.freezes-nothing', { name: at.layout }), sheet);
    return null;
  }
  return addrAt({ col, row: placed.bodyFirst });
}

/** The rows the sheet's layouts start a printed page at, each with the layout that asked. */
function breaksOf(ctx: Ctx, sheet: Sheet): { row: number; node: NodeId }[] {
  return sheet.layouts.flatMap((layout) =>
    (ctx.placed.get(layout.id)?.breaks ?? []).map((row) => ({ row, node: layout.id })),
  );
}

/** A filled range may share no cell with another range or with a written cell (`docs/spec.md` §3). */
function clashes(
  ctx: Ctx,
  written: ReadonlyMap<CompiledFill, SpecNode>,
  cells: ReadonlyMap<string, CompiledCell>,
): void {
  const fills = [...written];
  const placed = [...cells.values()];

  for (const [index, [fill, node]] of fills.entries()) {
    const range = rangeOf(fill.rect);
    const earlier = fills.slice(0, index).find(([one]) => overlapping(one.rect, fill.rect));
    if (earlier !== undefined) {
      const other = rangeOf(earlier[0].rect);
      reject(ctx, CODE.fillOverlap, say('compile.fills-overlap', { range, other }), node);
    }

    const cell = placed.find((one) => within(cellOf(one.at), fill.rect));
    if (cell !== undefined) {
      reject(ctx, CODE.fillOverlap, say('compile.fill-covers-cell', { range, at: cell.at }), node);
    }
  }
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

function rowBand(ctx: Ctx, band: RowBand, sheet: SheetName): CompiledBand | null {
  const rows = bandRows(ctx, band, sheet);
  if (rows === null) return null;

  const { first, last } = rows;
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

/** The rows a band covers: as written, or a part of a named layout on the sheet (`docs/spec.md` §4). */
function bandRows(
  ctx: Ctx,
  band: RowBand,
  sheet: SheetName,
): { first: number; last: number } | null {
  const at = band.at;
  if (typeof at !== 'string' && at.kind === 'part') {
    const placed = layoutHere(ctx, at.layout, sheet, band);
    if (placed === null) return null;

    const rows = partRows(placed, at.part);
    if (rows === null) {
      reject(
        ctx,
        CODE.badLayout,
        say('compile.no-such-part', { part: at.part, name: at.layout }),
        band,
      );
    }
    return rows;
  }

  const spelled = text(ctx, at, band);
  const read = parseRowSpan(spelled);
  if (read === null) {
    reject(ctx, CODE.badRow, say('compile.not-a-row', { spelled }), band);
    return null;
  }
  return rowsOf(read);
}

/** A note's or a link's cell: as written, or by meaning in a layout on the sheet (`docs/spec.md` §10, §25). */
function decorated(
  ctx: Ctx,
  at: Templated<A1Addr> | ByMeaning,
  node: SpecNode,
  sheet: SheetName,
): A1Addr | null {
  if (typeof at === 'string' || at.kind === 'template') return address(ctx, at, node);

  const found = byMeaning(ctx, at, node);
  if (found === null) return null;
  if (found.sheet === sheet) return found.at;

  const message = say('compile.layout-on-another-sheet', { name: at.layout, sheet: found.sheet });
  reject(ctx, CODE.unknownLayout, message, node);
  return null;
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
function notesOf(ctx: Ctx, comments: readonly Note[], sheet: SheetName): Map<string, CompiledNote> {
  const notes = new Map<string, CompiledNote>();

  for (const note of comments) {
    const at = decorated(ctx, note.at, note, sheet);
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
  if (read === null) return null;

  declaredSheet(ctx, read.sheet, one);
  return { kind: 'listFrom', ...read };
}

/** Each link by the address it sits on; the later of two links on one cell is the one Excel keeps. */
function linksOf(ctx: Ctx, links: readonly Link[], sheet: SheetName): Map<string, CompiledLink> {
  const drawn = new Map<string, CompiledLink>();

  for (const link of links) {
    const at = decorated(ctx, link.at, link, sheet);
    if (at === null) continue;

    const target = text(ctx, link.target.text, link);
    if (link.target.kind === 'to') declaredSheet(ctx, sheetPrefix(target), link);

    drawn.set(at, {
      at,
      target: { kind: link.target.kind, text: target },
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

/** A sheet's auto filter: the range, whose top row Excel reads as the header, and the criteria saved with it (`docs/spec.md` §10). */
function filterOf(ctx: Ctx, sheet: Sheet, name: SheetName): CompiledFilter | null {
  const filter = sheet.filter;
  if (filter === null) return null;

  const over = filtered(ctx, filter, name);
  if (over === null) return null;

  const saved = (filter.columns ?? []).flatMap((one) => {
    const spelled =
      typeof one.at !== 'string' && one.at.kind === 'named' ? one.at.text : text(ctx, one.at, one);
    const span = parseColumnSpan(spelled);
    const col =
      (over.placed === null ? undefined : colOf(over.placed, spelled)) ??
      (span === null ? undefined : columnsOf(span).first);
    if (col === undefined) {
      reject(ctx, CODE.badColumn, say('compile.not-a-column', { spelled }), one);
      return [];
    }
    return [{ col, criterion: one.criterion }];
  });

  return { ...over.rect, saved };
}

/** The range a filter covers, and the layout it was given as, whose columns it may name. */
function filtered(
  ctx: Ctx,
  filter: Filter,
  sheet: SheetName,
): { rect: Rect; placed: Placed | null } | null {
  if (typeof filter.at !== 'string' && filter.at.kind === 'named') {
    const placed = layoutHere(ctx, filter.at.text, sheet, filter);
    return placed === null ? null : { rect: tableOf(placed), placed };
  }

  const spelled = text(ctx, filter.at, filter);
  const read = parseA1Range(spelled);
  if (read === null) {
    reject(ctx, CODE.badRange, say('compile.not-a-range', { spelled }), filter);
    return null;
  }
  return { rect: rectOf(read), placed: null };
}
