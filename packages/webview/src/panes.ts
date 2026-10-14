import { gutterOf } from './outline';
import type { DrawnSheet } from './protocol';
import { GUTTER, HEADING } from './showing';
import { across, down } from './window';

/** A sheet's panes: the one that scrolls, and the three a freeze holds still (`docs/spec.md` §2). */
export type Pane = 'scrolls' | 'columns' | 'rows' | 'corner';

/** The panes in the order they are drawn, each over the one before. */
export const PANES: readonly Pane[] = ['scrolls', 'columns', 'rows', 'corner'];

/** Something drawn over the grid, and the pane it belongs to. */
export type Laid = readonly [Pane, HTMLElement];

/** The pane a cell is in. */
export function paneAt(sheet: DrawnSheet, at: { row: number; col: number }): Pane {
  const rows = sheet.freeze !== null && at.row < sheet.freeze.row;
  const columns = sheet.freeze !== null && at.col < sheet.freeze.col;

  if (rows && columns) return 'corner';
  if (rows) return 'rows';
  return columns ? 'columns' : 'scrolls';
}

/**
 * The layers over the grid, one per pane with anything in it, in drawing order.
 * A frozen pane's layer is sticky, so it holds still with that pane's cells.
 */
export function layers(laid: readonly Laid[]): HTMLElement[] {
  return PANES.flatMap((pane) => {
    const held = laid.filter(([one]) => one === pane).map(([, drawn]) => drawn);
    if (held.length === 0) return [];

    const layer = document.createElement('div');
    layer.className = `pane ${pane}`;
    layer.append(...held);
    return [layer];
  });
}

/** What is drawn over every pane alike: one copy per pane in a `kind` box, each frozen copy cut to its own. */
export function paned(sheet: DrawnSheet, kind: string, pieces: () => HTMLElement[]): Laid[] {
  const copy = (pane: Pane, cut: { x: number; y: number } | null): Laid => {
    const box = document.createElement('div');
    box.className = kind;
    if (cut !== null) {
      box.style.clipPath = `polygon(0 0, ${cut.x}px 0, ${cut.x}px ${cut.y}px, 0 ${cut.y}px)`;
    }
    box.append(...pieces());
    return [pane, box];
  };

  const laid = [copy('scrolls', null)];
  const freeze = sheet.freeze;
  if (freeze === null) return laid;

  const wide = gutterOf(sheet, 'row') + GUTTER + across(sheet, freeze.col);
  const tall = gutterOf(sheet, 'column') + HEADING + down(sheet, freeze.row);
  const whole = sheetSize(sheet);
  if (freeze.col > 1) laid.push(copy('columns', { x: wide, y: whole.height }));
  if (freeze.row > 1) laid.push(copy('rows', { x: whole.width, y: tall }));
  if (freeze.col > 1 && freeze.row > 1) laid.push(copy('corner', { x: wide, y: tall }));

  return laid;
}

/** How far the drawn sheet reaches, headings and gutters included: what a line across all of it spans. */
export function sheetSize(sheet: DrawnSheet): { width: number; height: number } {
  return {
    width: gutterOf(sheet, 'row') + GUTTER + across(sheet, sheet.of.columns + 1),
    height: gutterOf(sheet, 'column') + HEADING + down(sheet, sheet.of.rows + 1),
  };
}
