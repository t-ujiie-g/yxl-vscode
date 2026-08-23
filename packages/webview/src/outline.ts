import type { Axis } from '@yxl-vscode/spec';
import { spanSaid } from '@yxl-vscode/units';
import type { DrawnSheet, Sized } from './protocol';
import { type Asks, OUTLINE } from './showing';

/** How many levels of outline this axis has, which is how wide its gutter is (ADR-045). */
export function levelsOf(sheet: DrawnSheet, axis: Axis): number {
  const runs = axis === 'column' ? sheet.widths : sheet.heights;
  return runs.reduce((deepest, run) => Math.max(deepest, run.group ?? 0), 0);
}

/** How much room the outline gutter takes on that axis, in pixels. */
export function gutterOf(sheet: DrawnSheet, axis: Axis): number {
  return levelsOf(sheet, axis) * OUTLINE;
}

/** The cells that stand in the row outline's gutter, at the start of a line: one per level. */
export function outline(
  sheet: DrawnSheet,
  row: number | null,
  asks: Asks,
  gone: Span | null = null,
): HTMLElement[] {
  const levels = levelsOf(sheet, 'row');
  const runs = groupsOf(sheet, 'row');
  const over = gone === null ? null : groupOver(sheet, 'row', gone);

  return Array.from({ length: levels }, (_, at) => {
    const level = at + 1;
    const cell = document.createElement('th');
    cell.className = 'outline row';
    cell.style.width = `${OUTLINE}px`;
    cell.style.left = `${at * OUTLINE}px`;

    const run =
      row === null ? undefined : runs.find((one) => one.group === level && held(one, row));
    if (run !== undefined && row !== null) drawOutline(cell, 'row', run, row, asks);
    if (over !== null && over.group === level) opening(cell, 'row', over, asks);

    return cell;
  });
}

/** Whether the run reaches this row or column, drawn or not. */
export function held(run: Grouped, at: number): boolean {
  return run.first <= at && at <= run.last;
}

/** The bracket and the control one level of an outline puts in its gutter. */
export function drawOutline(
  cell: HTMLElement,
  axis: Axis,
  run: Grouped,
  at: number,
  asks: Asks,
): void {
  if (run.hidden) return;

  cell.classList.add('in');
  if (at === run.first) cell.classList.add('opens');
  if (at === run.last) cell.append(control(axis, run, false, asks));
}

/** The control that opens a collapsed group, in the gutter beside the seam its run is hidden at. */
export function opening(cell: HTMLElement, axis: Axis, run: Grouped, asks: Asks): void {
  cell.classList.add('opening');
  cell.append(control(axis, run, true, asks));
}

/** The `−` that collapses a group, or the `+` that opens it — which is a write either way (ADR-044). */
function control(axis: Axis, run: Grouped, open: boolean, asks: Asks): HTMLElement {
  const drawn = document.createElement('button');
  drawn.type = 'button';
  drawn.className = `grouping ${axis} control`;
  drawn.style.setProperty(
    axis === 'column' ? 'top' : 'left',
    `${((run.group ?? 1) - 1) * LEVEL}px`,
  );
  drawn.textContent = open ? '+' : '\u2212';
  drawn.title = `${open ? 'Open' : 'Collapse'} ${spanSaid(axis, run.first, run.last)}`;
  drawn.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    asks.hide(axis, run.first, run.last, !open);
  });

  return drawn;
}

/** Every run of this axis that a band groups. */
export function groupsOf(sheet: DrawnSheet, axis: Axis): Grouped[] {
  const runs = axis === 'column' ? sheet.widths : sheet.heights;
  return runs.filter((run): run is Grouped => (run.group ?? 0) > 0);
}

/** The group a hidden run belongs to, whose own control is the way back rather than the plain mark. */
export function groupOver(sheet: DrawnSheet, axis: Axis, run: Span): Grouped | null {
  const over = groupsOf(sheet, axis).filter(
    (one) => one.hidden && one.first <= run.first && one.last >= run.last,
  );

  return over[over.length - 1] ?? null;
}

/** The mark that says a run is hidden behind this heading, and is the way back to it. */
export function hidden(heading: HTMLElement, axis: Axis, run: Span, asks: Asks): void {
  const mark = document.createElement('span');
  mark.className = `hiding ${axis}`;
  mark.title = `Show ${spanSaid(axis, run.first, run.last)} again`;
  mark.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    asks.hide(axis, run.first, run.last, false);
  });

  heading.classList.add('hides');
  heading.append(mark);
}

/** The run hidden between the last one drawn and this one, where there is one. */
export function behind(drawn: number | null, at: number): Span | null {
  return drawn !== null && at > drawn + 1 ? { first: drawn + 1, last: at - 1 } : null;
}

/** How far apart the levels of an outline sit, which is what makes a nested one legible. */
const LEVEL = 4;

/** A run a band groups, which is the runs `docs/spec.md` §4 gives an outline level above zero. */
type Grouped = Sized & { readonly group: number };

/** A run of rows or columns the sheet is not drawing, because something hides them. */
export interface Span {
  readonly first: number;
  readonly last: number;
}
