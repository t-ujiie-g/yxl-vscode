import { sheetOf } from '@yxl-vscode/compile';
import { holds, type Op, type Path } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import { type Filter, KEY, type Sheet } from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  cellOf,
  columnLabel,
  type Line,
  type NodeId,
  parseA1Addr,
  parseA1Range,
  parseQualifiedAddr,
  qualified,
  rangeOf,
  rectOf,
  type SheetName,
  shifted,
} from '@yxl-vscode/units';
import { located, type Projection, type Reading } from './direct';
import { formulas, overrideAt, references } from './renaming';
import { along, type Does, grown, moved, ownSheet, point } from './shift';
import { say } from './text';

/** One node a line rewrites, and the ops that do it once the node's path is known. */
export interface Anchored {
  readonly id: NodeId;
  readonly ops: (path: Path) => readonly Op[];
}

/**
 * What a line does to everything that names a place besides the cells, `data:`,
 * `formulas:`, merges, bands and freeze `drawLine` moves itself: the edits, and
 * what stands in the way. Excel moves every one of them with the line.
 */
export function anchors(
  spec: Projection,
  line: Line,
  read: Reading,
): { edits: Anchored[]; stops: Saying[] } {
  const edits: Anchored[] = [];
  const stops: Saying[] = [];
  const set = (id: NodeId, under: Path, value: string) =>
    edits.push({ id, ops: (path) => [{ op: 'set', path: [...path, ...under], value }] });
  const removed: { id: NodeId; under: Path }[] = [];
  const remove = (id: NodeId, under: Path = []) => {
    removed.push({ id, under });
    edits.push({ id, ops: (path) => [{ op: 'remove', path: [...path, ...under] }] });
  };
  const going = (id: NodeId, path: Path) =>
    removed.some((one) => one.id === id && one.under.every((step, index) => path[index] === step));

  const rename = (id: NodeId, to: A1Addr) =>
    edits.push({ id, ops: (path) => [{ op: 'renameKey', path, to }] });

  const sheet = ownSheet(spec, line);
  if (sheet !== undefined) onSheet(spec, sheet, line, read, { stops, set, remove, rename });

  const rewrite = (
    one: { id: NodeId; path: Path; text: string; where: string },
    of: SheetName,
    formula: boolean,
  ) => {
    if (going(one.id, one.path)) return;

    const now = shifted(one.text, of, line);
    if (now.ok) {
      if (now.formula !== one.text) set(one.id, one.path, now.formula);
      return;
    }
    stops.push(
      formula
        ? say('intent.formula-would-break', { at: one.where, formula: one.text, why: now.why })
        : say('intent.reference-would-break', { at: one.where, text: one.text, why: now.why }),
    );
  };

  for (const one of references(spec.doc, read)) rewrite(one, one.on ?? NOWHERE, false);
  for (const one of formulas(spec.doc)) {
    if (one.on !== line.sheet) rewrite(one, one.on ?? NOWHERE, true);
  }

  for (const one of spec.doc.overrides) {
    const spelled = overrideAt(one.at);
    const at = spelled === null ? null : parseQualifiedAddr(spelled);
    if (spelled === null || at === null) continue;

    const does = at.sheet === line.sheet ? along(line).at(cellOf(at.at)) : null;
    if (does === 'goes') {
      remove(one.id);
      continue;
    }
    if (does !== null) set(one.id, [KEY.at], qualified(at.sheet, moved(at.at, line)));

    if (one.formula?.kind === 'inline') {
      const formula = { id: one.id, path: [KEY.formula], text: one.formula.body, where: spelled };
      rewrite(formula, at.sheet, true);
    }
  }

  return { edits, stops };
}

/** The sheet a `defs.formulas` body is read on: none, so only a reference that names the line's sheet moves. */
const NOWHERE = '' as SheetName;

interface Collecting {
  readonly stops: Saying[];
  readonly rename: (id: NodeId, to: A1Addr) => void;
  readonly set: (id: NodeId, under: Path, value: string) => void;
  readonly remove: (id: NodeId, under?: Path) => void;
}

/** What the line's own sheet places by address: notes, links, rules, lists, tables, filter, print, floats, sparklines and layouts. */
function onSheet(spec: Projection, sheet: Sheet, line: Line, read: Reading, to: Collecting): void {
  const of = along(line);
  const { set, remove } = to;

  for (const one of [...sheet.comments, ...sheet.links]) {
    const at = point(one.at);
    const does = at === null ? null : of.at(cellOf(at));
    if (at === null || does === null) continue;

    if (does === 'goes') remove(one.id);
    else to.rename(one.id, moved(at, line));
  }

  for (const one of [...sheet.conditional, ...sheet.validations, ...sheet.tables]) {
    const now = area(one.at, line);
    if (now === 'goes') remove(one.id);
    else if (now !== null) set(one.id, [KEY.at], now);
  }

  // A table keeps its top row as its header, and needs a row of data under it.
  for (const table of sheet.tables) {
    const read = typeof table.at === 'string' ? parseA1Range(table.at) : null;
    if (read === null || line.axis !== 'row') continue;

    const rect = rectOf(read);
    const does = of.over(rect);
    if (does !== 'shrinks') continue;

    const left = grown(rect, line, does);
    if (of.at({ col: rect.left, row: rect.top }) === 'goes' || left.bottom <= left.top) {
      to.stops.push(say('intent.table-would-break', { at: rangeOf(rect) }));
    }
  }

  if (sheet.filter !== null) filtered(sheet, sheet.filter, line, to);

  // The print node's own id is not a path into the file; the sheet's is.
  if (sheet.print !== null) {
    const now = area(sheet.print.area, line);
    if (now === 'goes') remove(sheet.id, [KEY.print, 'area']);
    else if (now !== null) set(sheet.id, [KEY.print, 'area'], now);

    sheet.print.breaks.forEach((one, index) => {
      const at = point(one);
      const does = at === null ? null : of.at(cellOf(at));
      if (at === null || does === null) return;

      if (does === 'goes') remove(sheet.id, [KEY.print, 'breaks', index]);
      else set(sheet.id, [KEY.print, 'breaks', index], moved(at, line));
    });
  }

  for (const one of [...sheet.charts, ...sheet.images, ...sheet.shapes]) {
    const at = point(one.at);
    const does = at === null ? null : of.at(cellOf(at));
    if (at !== null && does !== null) set(one.id, [KEY.at], floated(at, line, does));
  }

  for (const group of sheet.sparklines) {
    const found = located(group.id, read);
    const listed = found.kind === 'found' && holds(found.node, KEY.cells);
    const doing = group.cells.map((one) => {
      const at = point(one.at);
      return { at, does: at === null ? null : of.at(cellOf(at)) };
    });

    if (doing.every((one) => one.does === 'goes')) {
      remove(group.id);
      continue;
    }
    doing.forEach(({ at, does }, index) => {
      const under: Path = listed ? [KEY.cells, index] : [];
      if (at === null || does === null) return;
      if (does === 'goes') remove(group.id, under);
      else set(group.id, [...under, KEY.at], moved(at, line));
    });
  }

  const drawn = sheetOf(spec.grid, line.sheet);
  for (const layout of sheet.layouts) {
    const placed = drawn?.layouts.find((one) => one.node === layout.id);
    const does = placed === undefined ? null : of.over(placed.rect);
    if (placed === undefined || does === null) continue;

    if (does !== 'shifts') {
      const near = line.axis === 'column' ? placed.rect.left : placed.rect.top;
      const far = line.axis === 'column' ? placed.rect.right : placed.rect.bottom;
      to.stops.push(say('intent.inside-a-layout', { axis: line.axis, at: near, last: far }));
      continue;
    }

    const at = point(layout.at);
    if (at !== null) set(layout.id, [KEY.at], moved(at, line));
  }
}

/** A range once the line is drawn: `goes` where the line takes all of it, `null` where it does not reach. */
function area(at: unknown, line: Line): string | 'goes' | null {
  const read = typeof at === 'string' ? parseA1Range(at) : null;
  if (read === null) return null;

  const rect = rectOf(read);
  const does = along(line).over(rect);
  if (does === null) return null;

  return does === 'goes' ? 'goes' : rangeOf(grown(rect, line, does));
}

/** A filter's range, and the column each saved criterion names, moved with the line; a criterion whose column goes goes too. */
function filtered(sheet: Sheet, filter: Filter, line: Line, to: Collecting): void {
  const now = area(filter.at, line);
  if (now === 'goes') {
    to.remove(sheet.id, [KEY.filter]);
    return;
  }
  if (now !== null)
    to.set(sheet.id, filter.columns === null ? [KEY.filter] : [KEY.filter, KEY.at], now);
  if (line.axis !== 'column' || filter.columns === null) return;

  const columns = filter.columns.map((one) => {
    const at = typeof one.at === 'string' ? parseA1Addr(`${one.at}1`) : null;
    return { at, does: at === null ? null : along(line).at(cellOf(at)) };
  });
  if (columns.length > 0 && columns.every((one) => one.does === 'goes')) {
    to.remove(sheet.id, [KEY.filter, KEY.columns]);
    return;
  }
  columns.forEach(({ at, does }, index) => {
    const under: Path = [KEY.filter, KEY.columns, index];
    if (at === null || does === null) return;
    if (does === 'goes') to.remove(sheet.id, under);
    else to.set(sheet.id, [...under, KEY.at], columnLabel(cellOf(moved(at, line)).col));
  });
}

/** Where a floating object's corner lands: moved with its cell, or onto the line that took its cell's place. */
function floated(at: A1Addr, line: Line, does: Does): A1Addr {
  if (does !== 'goes') return moved(at, line);

  const { col, row } = cellOf(at);
  return line.axis === 'column' ? addrAt({ col: line.at, row }) : addrAt({ col, row: line.at });
}
