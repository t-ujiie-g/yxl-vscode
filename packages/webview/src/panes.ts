import { gutterOf } from './outline';
import type { DrawnSheet } from './protocol';
import { GUTTER, HEADING } from './showing';
import { across, down } from './window';

/** A sheet's panes: the one that scrolls, and the three a freeze holds still (`docs/spec.md` §2). */
export type Pane = 'scrolls' | 'columns' | 'rows' | 'corner';

/** The panes in the order they are drawn, each over the one before. */
export const PANES: readonly Pane[] = ['scrolls', 'columns', 'rows', 'corner'];

/** The pane a cell is in. */
export function paneAt(sheet: DrawnSheet, at: { row: number; col: number }): Pane {
  const rows = sheet.freeze !== null && at.row < sheet.freeze.row;
  const columns = sheet.freeze !== null && at.col < sheet.freeze.col;

  if (rows && columns) return 'corner';
  if (rows) return 'rows';
  return columns ? 'columns' : 'scrolls';
}

/** One pane's layer over the grid, holding what is drawn in it; a copy of what crosses panes is `cut` to its own. */
export function paneLayer(
  which: Pane,
  held: readonly HTMLElement[],
  cut?: { x: number; y: number },
): HTMLElement {
  const layer = document.createElement('div');
  layer.className = `pane ${which}`;
  if (cut !== undefined) {
    layer.style.clipPath = `polygon(0 0, ${cut.x}px 0, ${cut.x}px ${cut.y}px, 0 ${cut.y}px)`;
  }
  layer.append(...held);
  return layer;
}

/** Hold each frozen pane's layers where the pane's cells are held, at the scroll the box has reached. */
export function holdPanes(box: HTMLElement): void {
  const by = { x: box.scrollLeft, y: box.scrollTop };
  const held: Record<Exclude<Pane, 'scrolls'>, string> = {
    columns: `translate(${by.x}px, 0)`,
    rows: `translate(0, ${by.y}px)`,
    corner: `translate(${by.x}px, ${by.y}px)`,
  };

  for (const [pane, transform] of Object.entries(held)) {
    for (const layer of box.querySelectorAll<HTMLElement>(`.pane.${pane}`)) {
      layer.style.transform = transform;
    }
  }
}

/** What is drawn over every pane alike: once per pane, each frozen pane's copy cut to the pane. */
export function paned(sheet: DrawnSheet, pieces: () => HTMLElement[]): HTMLElement[] {
  const layers = [paneLayer('scrolls', pieces())];
  const freeze = sheet.freeze;
  if (freeze === null) return layers;

  const wide = gutterOf(sheet, 'row') + GUTTER + across(sheet, freeze.col);
  const tall = gutterOf(sheet, 'column') + HEADING + down(sheet, freeze.row);
  const whole = sheetSize(sheet);
  if (freeze.col > 1) layers.push(paneLayer('columns', pieces(), { x: wide, y: whole.height }));
  if (freeze.row > 1) layers.push(paneLayer('rows', pieces(), { x: whole.width, y: tall }));
  if (freeze.col > 1 && freeze.row > 1) {
    layers.push(paneLayer('corner', pieces(), { x: wide, y: tall }));
  }

  return layers;
}

/** How far the drawn sheet reaches, headings and gutters included: what a line across all of it spans. */
export function sheetSize(sheet: DrawnSheet): { width: number; height: number } {
  return {
    width: gutterOf(sheet, 'row') + GUTTER + across(sheet, sheet.of.columns + 1),
    height: gutterOf(sheet, 'column') + HEADING + down(sheet, sheet.of.rows + 1),
  };
}
