// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { Drawing, DrawnCell, DrawnSheet } from './protocol';
import type { Asks, Showing } from './showing';
import { toolbar } from './toolbar';

function cell(of: Partial<DrawnCell>): DrawnCell {
  return {
    row: 1,
    col: 1,
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

function showing(of: { cells?: DrawnCell[]; selected?: { row: number; col: number } }): Showing {
  const sheet: DrawnSheet = {
    name: 'Sales',
    rows: 10,
    columns: 10,
    at: { row: 1, col: 1 },
    of: { rows: 10, columns: 10 },
    widths: [],
    heights: [],
    cells: of.cells ?? [],
    merges: [],
    problems: [],
  };

  const drawing: Drawing = {
    kind: 'drawing',
    file: 'spec.yxl.yaml',
    sheets: [sheet],
    params: [],
    diagnostics: [],
    uncomputed: null,
  };

  return {
    drawing,
    sheet: 0,
    selected: of.selected ?? null,
    anchor: null,
    sources: null,
    reached: null,
    refused: null,
    said: null,
    copied: null,
    looking: null,
    editable: 'direct',
  };
}

const asks = (wear = vi.fn()): Asks => ({ wear }) as unknown as Asks;

describe('the switches a reader reaches for first', () => {
  it('is disabled until a cell is selected, since a look needs somewhere to land', () => {
    const bar = toolbar(showing({}), asks());
    const buttons = [...bar.querySelectorAll('button')];

    expect(buttons.map((one) => [one.textContent, one.disabled])).toEqual([
      ['B', true],
      ['I', true],
      ['U', true],
      ['S', true],
    ]);
  });

  it('asks for the other of what the selected cell wears', () => {
    const wear = vi.fn();
    const cells = [cell({ style: { 'font.bold': true } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks(wear));

    bar.querySelector<HTMLButtonElement>('button')?.click();
    expect(wear).toHaveBeenCalledWith({ 'font.bold': false });
  });

  it('shows what the cell already wears, so the switch reads as one', () => {
    const cells = [cell({ style: { 'font.italic': true } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    const on = [...bar.querySelectorAll('button')].map((one) => one.classList.contains('on'));
    expect(on).toEqual([false, true, false, false]);
  });
});
