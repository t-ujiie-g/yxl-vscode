import {
  type ByMeaning,
  ERROR_STYLES,
  type Filter,
  type Link,
  type Note,
  type Sheet,
  type SpecNode,
  type Table,
  type Templated,
  type Validation,
} from '@yxl-vscode/spec';
import {
  type A1Addr,
  columnsOf,
  parseA1Range,
  parseColumnSpan,
  type Rect,
  rectOf,
  type SheetName,
  sheetPrefix,
} from '@yxl-vscode/units';
import { address, spelling } from './cell';
import { CODE } from './codes';
import { type Ctx, declaredSheet, reject, text } from './ctx';
import type {
  CompiledAsk,
  CompiledFilter,
  CompiledLink,
  CompiledNote,
  CompiledTable,
  CompiledValidation,
} from './grid';
import { byMeaning, covered, layoutHere, readRange, tableOf } from './named';
import { colOf, type Placed } from './placed';
import { say } from './text';

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

/** Each note by the address it sits on; the later of two notes on one cell is the one Excel keeps. */
export function notesOf(
  ctx: Ctx,
  comments: readonly Note[],
  sheet: SheetName,
): Map<string, CompiledNote> {
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
export function validation(ctx: Ctx, one: Validation, sheet: SheetName): CompiledValidation | null {
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
export function linksOf(
  ctx: Ctx,
  links: readonly Link[],
  sheet: SheetName,
): Map<string, CompiledLink> {
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
export function table(ctx: Ctx, one: Table, sheet: SheetName): CompiledTable | null {
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
export function filterOf(ctx: Ctx, sheet: Sheet, name: SheetName): CompiledFilter | null {
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
