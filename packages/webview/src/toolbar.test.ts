// @vitest-environment jsdom

import { type Color, parseColor } from '@yxl-vscode/units';
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

/** The rectangle the one selected cell of these fixtures names. */
const ONE = { top: 1, left: 1, bottom: 1, right: 1 };

describe('the switches a reader reaches for first', () => {
  it('is disabled until a cell is selected, since a look needs somewhere to land', () => {
    const bar = toolbar(showing({}), asks());
    const buttons = [...bar.querySelectorAll('button')];

    expect(buttons.map((one) => [one.textContent, one.disabled])).toEqual([
      ['B', true],
      ['I', true],
      ['U', true],
      ['S', true],
      ['×', true],
      ['×', true],
    ]);
    expect([...bar.querySelectorAll('input')].every((one) => one.disabled)).toBe(true);
  });

  it('asks for the other of what the selected cell wears', () => {
    const wear = vi.fn();
    const cells = [cell({ style: { 'font.bold': true } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks(wear));

    bar.querySelector<HTMLButtonElement>('button')?.click();
    expect(wear).toHaveBeenCalledWith({ 'font.bold': false }, ONE);
  });

  it('shows what the cell already wears, so the switch reads as one', () => {
    const cells = [cell({ style: { 'font.italic': true } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    const on = [...bar.querySelectorAll('button.look:not(.off)')].map((one) =>
      one.classList.contains('on'),
    );
    expect(on).toEqual([false, true, false, false]);
  });
});

describe('the colours a reader picks', () => {
  const NAVY = parseColor('1F3864') as Color;
  const RED = parseColor('FF0000') as Color;
  const ink = (bar: HTMLElement) => bar.querySelector<HTMLInputElement>('.look.ink .pick');
  const fill = (bar: HTMLElement) => bar.querySelector<HTMLInputElement>('.look.fill .pick');

  it('opens on what the selected cell wears', () => {
    const cells = [cell({ style: { fill: NAVY } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    expect(fill(bar)?.value).toBe('#1f3864');
    expect(ink(bar)?.value).toBe('#000000');
  });

  it('asks for the colour picked, in the spelling a spec writes', () => {
    const wear = vi.fn();
    const bar = toolbar(showing({ cells: [cell({})], selected: { row: 1, col: 1 } }), asks(wear));

    const pick = fill(bar);
    if (pick === null) throw new Error('there is no picker');
    pick.value = '#1f3864';
    pick.dispatchEvent(new Event('change'));

    expect(wear).toHaveBeenCalledWith({ fill: '1F3864' }, ONE);
  });

  it('asks for it off, which is a look the schema says by leaving it out', () => {
    const wear = vi.fn();
    const cells = [cell({ style: { 'font.color': RED } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks(wear));

    bar.querySelector<HTMLButtonElement>('button.off.ink')?.click();
    expect(wear).toHaveBeenCalledWith({ 'font.color': null }, ONE);
  });

  it('cannot be taken off where the cell has none', () => {
    const cells = [cell({ style: { fill: NAVY } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    expect(bar.querySelector<HTMLButtonElement>('button.off.fill')?.disabled).toBe(false);
    expect(bar.querySelector<HTMLButtonElement>('button.off.ink')?.disabled).toBe(true);
  });
});
