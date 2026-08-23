/** The fixtures the view's tests draw with: a sheet, what is showing, and what it can ask for. */
import { vi } from 'vitest';
import { draw } from './draw';
import type { Drawing, DrawnCell, DrawnSheet } from './protocol';
import type { Asks, Showing } from './showing';

export function asks(): Asks {
  return {
    showSheet: vi.fn(),
    drawWith: vi.fn(),
    resize: vi.fn(),
    select: vi.fn(),
    reveal: vi.fn(),
    setParam: vi.fn(),
    showWindow: vi.fn(),
    edit: vi.fn(),
    empty: vi.fn(),
    undo: vi.fn(),
    reachTo: vi.fn(),
    answer: vi.fn(),
    overrideWith: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    look: vi.fn(),
    goOn: vi.fn(),
    goTo: vi.fn(),
    stopLooking: vi.fn(),
    wear: vi.fn(),
    freeze: vi.fn(),
    openMenu: vi.fn(),
    takeBand: vi.fn(),
    takeAll: vi.fn(),
    fit: vi.fn(),
    hide: vi.fn(),
    pointAt: vi.fn(),
    group: vi.fn(),
    line: vi.fn(),
  };
}

export function cell(row: number, col: number, of: Partial<DrawnCell> = {}): DrawnCell {
  return {
    row,
    col,
    value: null,
    formula: null,
    filledFrom: null,
    format: null,
    rich: null,
    computed: null,
    overridden: false,
    editable: 'direct',
    style: {},
    ...of,
  };
}

export function sheet(of: Partial<DrawnSheet> = {}): DrawnSheet {
  return {
    name: 'Sales',
    rows: 2,
    columns: 2,
    at: { row: 1, col: 1 },
    of: { rows: of.rows ?? 2, columns: of.columns ?? 2 },
    widths: [],
    heights: [],
    cells: [],
    merges: [],
    problems: [],
    freeze: null,
    ...of,
  };
}

export function drawing(of: Partial<Drawing> = {}): Drawing {
  return {
    kind: 'drawing',
    file: 'spec.yxl.yaml',
    sheets: [sheet()],
    params: [],
    diagnostics: [],
    uncomputed: null,
    ...of,
  };
}

export function showingOf(of: Partial<Showing> = {}): Showing {
  return {
    drawing: drawing(),
    sheet: 0,
    selected: null,
    anchor: null,
    sources: null,
    reached: null,
    refused: null,
    said: null,
    copied: null,
    looking: null,
    editable: null,
    line: 'thin',
    menu: null,
    pointed: null,
    comes: null,
    ...of,
  };
}

export function shown(of: Partial<Showing> = {}, on: Asks = asks()): HTMLElement {
  const into = document.createElement('div');
  draw(into, showingOf(of), on);
  return into;
}

/** The cell at a place, as the drawn table has it. */
export function at(into: HTMLElement, row: number, col: number): HTMLTableCellElement | undefined {
  const line = into.querySelectorAll('tbody tr')[row - 1];
  return [...(line?.querySelectorAll('td') ?? [])][col - 1];
}

/** Leave the scroller somewhere, as a reader would. */
export function scrolled(into: HTMLElement, top: number): void {
  const box = into.querySelector('.scroller');
  if (!(box instanceof HTMLElement)) throw new Error('no scroller');
  box.scrollTop = top;
}
