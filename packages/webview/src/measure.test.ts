// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { ruler, widest } from './measure';
import type { DrawnCell } from './protocol';

function cell(of: Partial<DrawnCell> = {}): DrawnCell {
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
    bar: null,
    icon: null,
    note: null,
    link: null,
    validation: null,
    sparkline: null,
    ...of,
  };
}

/** A ruler that counts characters, so a test asserts on what was measured rather than on a font. */
const counting = (text: string, font: string) => text.length * (font.includes('bold') ? 2 : 1);

describe('the font a cell is measured in', () => {
  /** A ruler that reports the font it was handed, which is what is under test here. */
  const noting = (fonts: string[]) => (text: string, font: string) => {
    fonts.push(font);
    return text.length;
  };

  it('is the grid own where the cell says nothing, and the cell own where it does', () => {
    const fonts: string[] = [];
    widest(
      [
        cell({ value: 'plain' }),
        cell({
          value: 'dressed',
          style: {
            'font.bold': true,
            'font.italic': true,
            'font.size': 14,
            'font.name': 'Meiryo',
          },
        }),
      ],
      noting(fonts),
    );

    expect(fonts).toEqual([
      '11pt Calibri, Aptos, "Segoe UI", system-ui, sans-serif',
      'italic bold 14pt Meiryo',
    ]);
  });
});

describe('how wide a column has to be', () => {
  it('is the widest of its cells, with what a cell keeps either side of its text', () => {
    const cells = [cell({ value: 'APAC' }), cell({ value: 'EMEA and more' })];
    expect(widest(cells, counting)).toBe(13 + 10);
  });

  it('measures each cell in its own font, so a bold word can be the widest', () => {
    const cells = [
      cell({ value: 'a longer word' }),
      cell({ value: 'bold', style: { 'font.bold': true } }),
    ];
    expect(widest(cells, counting)).toBe(Math.max(13, 4 * 2) + 10);
  });

  it('measures what the cell shows, which for a formula is the formula', () => {
    expect(widest([cell({ formula: 'SUM(A1:A9)' })], counting)).toBe('=SUM(A1:A9)'.length + 10);
  });

  it('measures the whole of a cell written in runs', () => {
    const rich = [
      { text: 'one ', style: {} },
      { text: 'two', style: {} },
    ];
    expect(widest([cell({ rich })], counting)).toBe(7 + 10);
  });

  it('is nothing at all where none of them holds anything, which leaves the column alone', () => {
    expect(widest([cell(), cell({ value: '' })], counting)).toBeNull();
    expect(widest([], counting)).toBeNull();
  });
});

describe('the ruler the view measures with', () => {
  it('is nothing where the view has no canvas to measure on, which jsdom has not', () => {
    expect(ruler()).toBeNull();
  });
});
