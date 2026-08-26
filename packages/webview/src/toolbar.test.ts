// @vitest-environment jsdom

import { type Color, parseColor } from '@yxl-vscode/units';
import { describe, expect, it, vi } from 'vitest';
import { cell, sheet as drawnSheet } from './harness';
import type { Drawing, DrawnCell, DrawnSheet } from './protocol';
import type { Asks, Showing } from './showing';
import { toolbar } from './toolbar';

function showing(of: {
  cells?: DrawnCell[];
  selected?: { row: number; col: number };
  freeze?: DrawnSheet['freeze'];
  menu?: string;
}): Showing {
  const sheet = drawnSheet({
    rows: 10,
    columns: 10,
    of: { rows: 10, columns: 10 },
    cells: of.cells ?? [],
    freeze: of.freeze ?? null,
  });

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
    menu: of.menu ?? null,
    pointed: null,
    naming: null,
    asking: null,
    comes: null,
  };
}

const asks = (wear = vi.fn()): Asks => ({ wear, openMenu: vi.fn() }) as unknown as Asks;

/** What a control's own tooltip says, which is where its name lives. */
const said = (on: Element | null) => on?.getAttribute('data-says') ?? null;

/** The rectangle the one selected cell of these fixtures names. */
const ONE = { top: 1, left: 1, bottom: 1, right: 1 };

describe('the switches a reader reaches for first', () => {
  it('is disabled until a cell is selected, since a look needs somewhere to land', () => {
    const bar = toolbar(showing({}), asks());
    const buttons = [...bar.querySelectorAll('button')];

    // Freezing is not a look: it wants a cell, but taking a freeze off does not.
    expect(buttons.filter((one) => said(one) !== 'Freeze panes').every((one) => one.disabled)).toBe(
      true,
    );
    expect(buttons.map((one) => said(one))).toEqual([
      'Bold (Ctrl+B)',
      'Italic (Ctrl+I)',
      'Underline (Ctrl+U)',
      'Strikethrough',
      'Text colour',
      'Fill',
      'Align left',
      'Align centre',
      'Align right',
      'Align top',
      'Align middle',
      'Align bottom',
      'Wrap text',
      'Format as percent',
      'Fewer decimal places',
      'More decimal places',
      'Borders',
      'Freeze panes',
      'Clear formatting',
    ]);
  });

  it('writes the shortcut in the tooltip of the three switches that have one', () => {
    const bar = toolbar(showing({ selected: { row: 1, col: 1 } }), asks());
    const of = (name: string) => said(bar.querySelector(`button.look.${name}`));

    expect([of('bold'), of('strike')]).toEqual(['Bold (Ctrl+B)', 'Strikethrough']);
  });

  it('draws the tooltip itself, since a webview never shows the browser’s', () => {
    const bar = toolbar(showing({ selected: { row: 1, col: 1 } }), asks());
    const button = bar.querySelector<HTMLButtonElement>('button.look.bold');

    expect(button?.title).toBe('');
    expect(button?.getAttribute('aria-label')).toBe('Bold (Ctrl+B)');
  });

  it('asks for the other of what the selected cell wears', () => {
    const wear = vi.fn();
    const cells = [cell(1, 1, { style: { 'font.bold': true } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks(wear));

    bar.querySelector<HTMLButtonElement>('button')?.click();
    expect(wear).toHaveBeenCalledWith({ 'font.bold': false }, ONE);
  });

  it('shows what the cell already wears, so the switch reads as one', () => {
    const cells = [cell(1, 1, { style: { 'font.italic': true } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    const on = [...bar.querySelectorAll('button.look')]
      .slice(0, 4)
      .map((one) => one.classList.contains('on'));
    expect(on).toEqual([false, true, false, false]);
  });
});

describe('the colours a reader picks', () => {
  const NAVY = parseColor('1F3864') as Color;
  const RED = parseColor('FF0000') as Color;
  const opened = (key: 'ink' | 'fill', of: Parameters<typeof showing>[0], on = vi.fn()) =>
    toolbar(showing({ ...of, menu: key }), asks(on));

  it('is a palette under the button, which is where a spreadsheet keeps one', () => {
    const bar = opened('fill', { cells: [cell(1, 1, {})], selected: { row: 1, col: 1 } });

    expect(bar.querySelectorAll('.panel .swatch')).toHaveLength(20);
    expect(bar.querySelector('.panel .entry.clears')?.textContent).toBe('No fill');
  });

  it('says which of the standards the cell already wears', () => {
    const cells = [cell(1, 1, { style: { fill: NAVY } })];
    const navy = opened('fill', { cells, selected: { row: 1, col: 1 } });
    const black = opened('ink', { cells, selected: { row: 1, col: 1 } });

    expect(navy.querySelector('.panel .swatch.here')).toBeNull();
    expect(black.querySelector('.panel .swatch.here')).toBeNull();

    const red = opened('ink', {
      cells: [cell(1, 1, { style: { 'font.color': RED } })],
      selected: { row: 1, col: 1 },
    });
    expect(red.querySelector('.panel .swatch.here')?.getAttribute('title')).toBe('#FF0000');
  });

  it('asks for the standard picked, in the spelling a spec writes', () => {
    const wear = vi.fn();
    const bar = opened('fill', { cells: [cell(1, 1, {})], selected: { row: 1, col: 1 } }, wear);

    bar.querySelector<HTMLButtonElement>('.panel .swatch[title="#FF9900"]')?.click();
    expect(wear).toHaveBeenCalledWith({ fill: 'FF9900' }, ONE);
  });

  it('opens the picker on what the cell wears, for a colour the standards do not have', () => {
    const wear = vi.fn();
    const cells = [cell(1, 1, { style: { fill: NAVY } })];
    const bar = opened('fill', { cells, selected: { row: 1, col: 1 } }, wear);

    const pick = bar.querySelector<HTMLInputElement>('.panel .custom .pick');
    if (pick === null) throw new Error('there is no picker');
    expect(pick.value).toBe('#1f3864');

    pick.value = '#4a86e8';
    pick.dispatchEvent(new Event('change'));
    expect(wear).toHaveBeenCalledWith({ fill: '4A86E8' }, ONE);
  });

  it('asks for it off, which is a look the schema says by leaving it out', () => {
    const wear = vi.fn();
    const cells = [cell(1, 1, { style: { 'font.color': RED } })];
    const bar = opened('ink', { cells, selected: { row: 1, col: 1 } }, wear);

    bar.querySelector<HTMLButtonElement>('.panel .entry.clears')?.click();
    expect(wear).toHaveBeenCalledWith({ 'font.color': null }, ONE);
  });

  it('cannot be taken off where the cell has none', () => {
    const cells = [cell(1, 1, { style: { fill: NAVY } })];
    const fill = opened('fill', { cells, selected: { row: 1, col: 1 } });
    const ink = opened('ink', { cells, selected: { row: 1, col: 1 } });

    expect(fill.querySelector<HTMLButtonElement>('.panel .entry.clears')?.disabled).toBe(false);
    expect(ink.querySelector<HTMLButtonElement>('.panel .entry.clears')?.disabled).toBe(true);
  });

  it('shows the colour on the button, so the bar says what is set without opening', () => {
    const cells = [cell(1, 1, { style: { fill: NAVY } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());
    const swatch = bar.querySelector<HTMLElement>('.look.fill .letter');

    expect(swatch?.style.borderBottomColor).toBe('rgb(31, 56, 100)');
  });
});

describe('where the text sits', () => {
  const marks = (bar: HTMLElement) =>
    [...bar.querySelectorAll('button.look:not(.opener)')].filter(
      (one) => one.querySelector('svg') !== null,
    );

  it('is a group where only the one that holds is lit', () => {
    const cells = [cell(1, 1, { style: { 'align.horizontal': 'center' } })];
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
    const bar = toolbar(
      showing({ cells: [cell(1, 1, {})], selected: { row: 1, col: 1 } }),
      asks(wear),
    );

    bar.querySelector<HTMLButtonElement>('button.right')?.click();
    expect(wear).toHaveBeenCalledWith({ 'align.horizontal': 'right' }, ONE);

    bar.querySelector<HTMLButtonElement>('button.middle')?.click();
    expect(wear).toHaveBeenCalledWith({ 'align.vertical': 'middle' }, ONE);
  });

  it('takes it off where the one pressed is the one that holds (ADR-039)', () => {
    const wear = vi.fn();
    const cells = [cell(1, 1, { style: { 'align.horizontal': 'right' } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks(wear));

    bar.querySelector<HTMLButtonElement>('button.right')?.click();
    expect(wear).toHaveBeenCalledWith({ 'align.horizontal': null }, ONE);
  });

  it('wraps as a switch, since that is what the schema makes of it', () => {
    const wear = vi.fn();
    const bar = toolbar(
      showing({ cells: [cell(1, 1, {})], selected: { row: 1, col: 1 } }),
      asks(wear),
    );

    bar.querySelector<HTMLButtonElement>('button.wrap')?.click();
    expect(wear).toHaveBeenCalledWith({ 'align.wrap': true }, ONE);
  });
});

describe('a number under a format', () => {
  const box = (bar: HTMLElement) => bar.querySelector<HTMLSelectElement>('select.numbers');

  it('is on General where the cell has none', () => {
    const bar = toolbar(showing({ cells: [cell(1, 1, {})], selected: { row: 1, col: 1 } }), asks());

    expect(box(bar)?.value).toBe('');
    expect(said(box(bar)?.parentElement ?? null)).toBe('Number format');
  });

  it('asks for the code behind what the reader picked', () => {
    const wear = vi.fn();
    const bar = toolbar(
      showing({ cells: [cell(1, 1, {})], selected: { row: 1, col: 1 } }),
      asks(wear),
    );

    const select = box(bar);
    if (select === null) throw new Error('there is no format box');
    select.value = '0.0%';
    select.dispatchEvent(new Event('change'));

    expect(wear).toHaveBeenCalledWith({ format: '0.0%' }, ONE);
  });

  it('asks for it off where the reader picks General', () => {
    const wear = vi.fn();
    const cells = [cell(1, 1, { style: { format: '0.0%' } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks(wear));

    const select = box(bar);
    if (select === null) throw new Error('there is no format box');
    select.value = '';
    select.dispatchEvent(new Event('change'));

    expect(wear).toHaveBeenCalledWith({ format: null }, ONE);
  });

  it('says what each format would make of the number the cell holds', () => {
    const cells = [cell(1, 1, { value: 1234.5678 })];
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
    const cells = [cell(1, 1, { value: 'APAC' })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    const options = [...(box(bar)?.options ?? [])].map((one) => one.textContent);
    expect(options).toEqual([
      'General',
      '#,##0',
      '#,##0.00',
      '0.00',
      '0%',
      '0.0%',
      '¥#,##0',
      '$#,##0.00',
      'yyyy-mm-dd',
      'h:mm',
    ]);
  });

  it('makes it of what a formula was computed to, since that is the number shown', () => {
    const cells = [cell(1, 1, { value: null, computed: { kind: 'value', value: 0.085 } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    const options = [...(box(bar)?.options ?? [])].map((one) => one.textContent);
    expect(options[5]).toBe('8.5%');
  });

  it('shows a code it does not offer rather than losing it', () => {
    const cells = [cell(1, 1, { style: { format: '[h]:mm:ss' } })];
    const bar = toolbar(showing({ cells, selected: { row: 1, col: 1 } }), asks());

    expect(box(bar)?.value).toBe('[h]:mm:ss');
    expect(said(box(bar)?.parentElement ?? null)).toBe('Number format: [h]:mm:ss');
  });

  it('is disabled until a cell is selected', () => {
    expect(box(toolbar(showing({}), asks()))?.disabled).toBe(true);
  });
});

describe('a border a reader draws', () => {
  const drawn = (bar: HTMLElement, name: string) =>
    bar.querySelector<HTMLButtonElement>(`.panel button.edge.${name}`);
  const opened = (of: Parameters<typeof showing>[0], on: Asks) =>
    toolbar(showing({ ...of, menu: 'borders' }), on);

  it('is one button that opens the edges, as Sheets and Excel both keep it', () => {
    const bar = toolbar(showing({ cells: [cell(1, 1, {})], selected: { row: 1, col: 1 } }), asks());

    expect(bar.querySelectorAll('button.edge')).toHaveLength(0);
    expect(said(bar.querySelector('button.borders'))).toBe('Borders');
  });

  it('puts the line the toolbar is set to on the edges it names', () => {
    const wear = vi.fn();
    const bar = opened({ cells: [cell(1, 1, {})], selected: { row: 1, col: 1 } }, asks(wear));

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
    const at = {
      ...showing({ cells: [cell(1, 1, {})], selected: { row: 1, col: 1 }, menu: 'borders' }),
      line: 'double',
    };
    const bar = toolbar(at as Showing, asks(wear));

    drawn(bar, 'top')?.click();
    expect(wear).toHaveBeenCalledWith({ 'border.top.style': 'double' }, ONE);
  });

  it('asks for the line style the reader picked, which is the view own setting', () => {
    const drawWith = vi.fn();
    const bar = opened({ cells: [cell(1, 1, {})], selected: { row: 1, col: 1 } }, {
      drawWith,
    } as unknown as Asks);

    const box = bar.querySelector<HTMLSelectElement>('.panel select.lines');
    if (box === null) throw new Error('there is no line box');
    box.value = 'medium';
    box.dispatchEvent(new Event('change'));

    expect(drawWith).toHaveBeenCalledWith('medium');
  });

  it('takes every edge off, since that is the unit the schema has (ADR-039)', () => {
    const wear = vi.fn();
    const bar = opened({ cells: [cell(1, 1, {})], selected: { row: 1, col: 1 } }, asks(wear));

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
    const cells = [cell(1, 1, { style: { 'border.top.style': 'thin' } })];
    const bar = opened({ cells, selected: { row: 1, col: 1 } }, asks());

    const lit = [...bar.querySelectorAll('button.edge')].some((one) =>
      one.classList.contains('on'),
    );
    expect(lit).toBe(false);
  });
});

describe('where the sheet is frozen', () => {
  const asksFreeze = (freeze = vi.fn()): Asks => ({ freeze, openMenu: vi.fn() }) as unknown as Asks;
  const opened = (of: Parameters<typeof showing>[0], on: Asks) =>
    toolbar(showing({ ...of, menu: 'freeze' }), on);
  const entries = (bar: HTMLElement) => [
    ...bar.querySelectorAll<HTMLButtonElement>('.panel .entry'),
  ];

  it('is one button that opens what a spreadsheet keeps under View', () => {
    const bar = toolbar(showing({ selected: { row: 2, col: 2 } }), asksFreeze());
    expect(said(bar.querySelector('button.freeze'))).toBe('Freeze panes');
  });

  it('freezes up to the cell the reader has selected, and says which', () => {
    const freeze = vi.fn();
    const bar = opened({ selected: { row: 2, col: 2 } }, asksFreeze(freeze));

    expect(entries(bar).map((one) => one.textContent)).toEqual([
      'Freeze up to B2',
      'No frozen panes',
    ]);

    entries(bar)[0]?.click();
    expect(freeze).toHaveBeenCalledWith({ row: 2, col: 2 });
  });

  it('cannot freeze at A1, which would freeze nothing (`docs/spec.md` §2)', () => {
    const bar = opened({ selected: { row: 1, col: 1 } }, asksFreeze());
    expect(entries(bar)[0]?.disabled).toBe(true);
  });

  it('takes the freeze off, and offers that only where there is one', () => {
    const freeze = vi.fn();
    const bar = opened({ freeze: { row: 2, col: 2 } }, asksFreeze(freeze));

    entries(bar)[1]?.click();
    expect(freeze).toHaveBeenCalledWith(null);
    expect(entries(opened({}, asksFreeze()))[1]?.disabled).toBe(true);
  });
});

describe('how the bar is laid out', () => {
  it('rules the groups apart, so a bar that wrapped still reads as groups', () => {
    const bar = toolbar(showing({ selected: { row: 1, col: 1 } }), asks());
    const kinds = [...bar.children].map((one) => (one.className === 'divider' ? '|' : '.'));

    // Face and size, the switches, colour, alignment across, alignment down,
    // number, the two menus, and clearing.
    expect(kinds.join('').split('|')).toHaveLength(8);
  });
});
