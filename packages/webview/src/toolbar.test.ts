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
    line: 'thin',
  };
}

const asks = (wear = vi.fn()): Asks => ({ wear }) as unknown as Asks;

/** The rectangle the one selected cell of these fixtures names. */
const ONE = { top: 1, left: 1, bottom: 1, right: 1 };

describe('the switches a reader reaches for first', () => {
  it('is disabled until a cell is selected, since a look needs somewhere to land', () => {
    const bar = toolbar(showing({}), asks());
    const buttons = [...bar.querySelectorAll('button')];

    expect(buttons.every((one) => one.disabled)).toBe(true);
    expect(buttons.map((one) => one.title)).toEqual([
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Automatic text colour',
      'No fill',
      'Align left',
      'Align centre',
      'Align right',
      'Align top',
      'Align middle',
      'Align bottom',
      'Wrap text',
      'All borders',
      'Top border',
      'Bottom border',
      'Left border',
      'Right border',
      'No borders',
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

    const on = [...bar.querySelectorAll('button.look:not(.off)')]
      .slice(0, 4)
      .map((one) => one.classList.contains('on'));
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

describe('where the text sits', () => {
  const marks = (bar: HTMLElement) =>
    [...bar.querySelectorAll('button.look:not(.edge)')].filter(
      (one) => one.querySelector('svg') !== null,
    );

  it('is a group where only the one that holds is lit', () => {
    const cells = [cell({ style: { 'align.horizontal': 'center' } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    expect(marks(bar).map((one) => one.classList.contains('on'))).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('asks for the one pressed, over both axes', () => {
    const wear = vi.fn();
    const bar = toolbar(showing({ cells: [cell({})], selected: { row: 1, col: 1 } }), asks(wear));

    bar.querySelector<HTMLButtonElement>('button.right')?.click();
    expect(wear).toHaveBeenCalledWith({ 'align.horizontal': 'right' }, ONE);

    bar.querySelector<HTMLButtonElement>('button.middle')?.click();
    expect(wear).toHaveBeenCalledWith({ 'align.vertical': 'middle' }, ONE);
  });

  it('takes it off where the one pressed is the one that holds (ADR-039)', () => {
    const wear = vi.fn();
    const cells = [cell({ style: { 'align.horizontal': 'right' } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks(wear));

    bar.querySelector<HTMLButtonElement>('button.right')?.click();
    expect(wear).toHaveBeenCalledWith({ 'align.horizontal': null }, ONE);
  });

  it('wraps as a switch, since that is what the schema makes of it', () => {
    const wear = vi.fn();
    const bar = toolbar(showing({ cells: [cell({})], selected: { row: 1, col: 1 } }), asks(wear));

    bar.querySelector<HTMLButtonElement>('button.wrap')?.click();
    expect(wear).toHaveBeenCalledWith({ 'align.wrap': true }, ONE);
  });
});

describe('a number under a format', () => {
  const box = (bar: HTMLElement) => bar.querySelector<HTMLSelectElement>('select.numbers');

  it('is on General where the cell has none', () => {
    const bar = toolbar(showing({ cells: [cell({})], selected: { row: 1, col: 1 } }), asks());

    expect(box(bar)?.value).toBe('');
    expect(box(bar)?.title).toBe('Number format');
  });

  it('asks for the code behind what the reader picked', () => {
    const wear = vi.fn();
    const bar = toolbar(showing({ cells: [cell({})], selected: { row: 1, col: 1 } }), asks(wear));

    const select = box(bar);
    if (select === null) throw new Error('there is no format box');
    select.value = '0.0%';
    select.dispatchEvent(new Event('change'));

    expect(wear).toHaveBeenCalledWith({ format: '0.0%' }, ONE);
  });

  it('asks for it off where the reader picks General', () => {
    const wear = vi.fn();
    const cells = [cell({ style: { format: '0.0%' } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks(wear));

    const select = box(bar);
    if (select === null) throw new Error('there is no format box');
    select.value = '';
    select.dispatchEvent(new Event('change'));

    expect(wear).toHaveBeenCalledWith({ format: null }, ONE);
  });

  it('says what each format would make of the number the cell holds', () => {
    const cells = [cell({ value: 1234.5678 })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    const options = [...(box(bar)?.options ?? [])].map((one) => [one.value, one.textContent]);
    expect(options.slice(0, 6)).toEqual([
      ['', 'General'],
      ['#,##0', '1,235'],
      ['#,##0.00', '1,234.57'],
      ['0.00', '1234.57'],
      ['0%', '123457%'],
      ['0.0%', '123456.8%'],
    ]);
  });

  it('says the code itself where the cell holds no number to make anything of', () => {
    const cells = [cell({ value: 'APAC' })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    const options = [...(box(bar)?.options ?? [])].map((one) => one.textContent);
    expect(options).toEqual([
      'General',
      '#,##0',
      '#,##0.00',
      '0.00',
      '0%',
      '0.0%',
      'yyyy-mm-dd',
      'h:mm',
    ]);
  });

  it('makes it of what a formula was computed to, since that is the number shown', () => {
    const cells = [cell({ value: null, computed: { kind: 'value', value: 0.085 } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    const options = [...(box(bar)?.options ?? [])].map((one) => one.textContent);
    expect(options[5]).toBe('8.5%');
  });

  it('shows a code it does not offer rather than losing it', () => {
    const cells = [cell({ style: { format: '[h]:mm:ss' } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    expect(box(bar)?.value).toBe('[h]:mm:ss');
    expect(box(bar)?.title).toBe('Number format: [h]:mm:ss');
  });

  it('is disabled until a cell is selected', () => {
    expect(box(toolbar(showing({}), asks()))?.disabled).toBe(true);
  });
});

describe('a border a reader draws', () => {
  const drawn = (bar: HTMLElement, name: string) =>
    bar.querySelector<HTMLButtonElement>(`button.edge.${name}`);

  it('puts the line the toolbar is set to on the edges it names', () => {
    const wear = vi.fn();
    const bar = toolbar(showing({ cells: [cell({})], selected: { row: 1, col: 1 } }), asks(wear));

    drawn(bar, 'bottom')?.click();
    expect(wear).toHaveBeenCalledWith({ 'border.bottom.style': 'thin' }, ONE);

    drawn(bar, 'all')?.click();
    expect(wear).toHaveBeenCalledWith(
      {
        'border.top.style': 'thin',
        'border.right.style': 'thin',
        'border.bottom.style': 'thin',
        'border.left.style': 'thin',
      },
      ONE,
    );
  });

  it('draws with the line the reader chose, not the one it started on', () => {
    const wear = vi.fn();
    const at = { ...showing({ cells: [cell({})], selected: { row: 1, col: 1 } }), line: 'double' };
    const bar = toolbar(at as Showing, asks(wear));

    drawn(bar, 'top')?.click();
    expect(wear).toHaveBeenCalledWith({ 'border.top.style': 'double' }, ONE);
  });

  it('asks for the line style the reader picked, which is the view own setting', () => {
    const drawWith = vi.fn();
    const bar = toolbar(showing({ cells: [cell({})], selected: { row: 1, col: 1 } }), {
      drawWith,
    } as unknown as Asks);

    const box = [...bar.querySelectorAll('select')][1];
    if (box === undefined) throw new Error('there is no line box');
    box.value = 'medium';
    box.dispatchEvent(new Event('change'));

    expect(drawWith).toHaveBeenCalledWith('medium');
  });

  it('takes every edge off, since that is the unit the schema has (ADR-039)', () => {
    const wear = vi.fn();
    const bar = toolbar(showing({ cells: [cell({})], selected: { row: 1, col: 1 } }), asks(wear));

    drawn(bar, 'none')?.click();
    expect(wear).toHaveBeenCalledWith(
      {
        'border.top.style': null,
        'border.top.color': null,
        'border.right.style': null,
        'border.right.color': null,
        'border.bottom.style': null,
        'border.bottom.color': null,
        'border.left.style': null,
        'border.left.color': null,
      },
      ONE,
    );
  });

  it('is never lit, since drawing a border is a thing done rather than worn', () => {
    const cells = [cell({ style: { 'border.top.style': 'thin' } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    const lit = [...bar.querySelectorAll('button.edge')].some((one) =>
      one.classList.contains('on'),
    );
    expect(lit).toBe(false);
  });
});
