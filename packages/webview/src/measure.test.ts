// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cell, sheet } from './harness';
import { ruler, tallest, widest } from './measure';
import { PADDING } from './window';

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
        cell(1, 1, { value: 'plain' }),
        cell(1, 1, {
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
  it('is the widest of its cells, with the five pixels a cell keeps around its text', () => {
    const cells = [cell(1, 1, { value: 'APAC' }), cell(1, 1, { value: 'EMEA and more' })];
    expect(widest(cells, counting)).toBe(13 + PADDING);
  });

  it('measures each cell in its own font, so a bold word can be the widest', () => {
    const cells = [
      cell(1, 1, { value: 'a longer word' }),
      cell(1, 1, { value: 'bold', style: { 'font.bold': true } }),
    ];
    expect(widest(cells, counting)).toBe(Math.max(13, 4 * 2) + PADDING);
  });

  it('measures what the cell shows, which for a formula is the formula', () => {
    expect(widest([cell(1, 1, { formula: 'SUM(A1:A9)' })], counting)).toBe(
      '=SUM(A1:A9)'.length + PADDING,
    );
  });

  it('measures the whole of a cell written in runs', () => {
    const rich = [
      { text: 'one ', style: {} },
      { text: 'two', style: {} },
    ];
    expect(widest([cell(1, 1, { rich })], counting)).toBe(7 + PADDING);
  });

  it('is nothing at all where none of them holds anything, which leaves the column alone', () => {
    expect(widest([cell(1, 1), cell(1, 1, { value: '' })], counting)).toBeNull();
    expect(widest([], counting)).toBeNull();
  });
});

describe('the ruler the view measures with', () => {
  it('is nothing where the view has no canvas to measure on, which jsdom has not', () => {
    expect(ruler()).toBeNull();
  });
});

describe('how tall a row has to be', () => {
  /** A layout that makes a row a pixel taller per character, so a test asserts on what was measured. */
  const laying = (): HTMLElement => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) {
        return this.isConnected ? (this.textContent?.length ?? 0) : 0;
      },
    });
    const into = document.createElement('div');
    document.body.append(into);
    return into;
  };

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight');
    document.body.replaceChildren();
  });

  it('is its tallest cell, measured off the page and taken away again', () => {
    const into = laying();
    const drawn = sheet({
      tall: [cell(2, 1, { value: 'x'.repeat(30) }), cell(2, 2, { value: 'x'.repeat(45) })],
    });

    expect([...tallest(drawn, into)]).toEqual([[2, 45]]);
    expect(into.children).toHaveLength(0);
  });

  it('leaves out a cell in a hidden column, which is drawn nowhere', () => {
    const into = laying();
    const drawn = sheet({
      widths: [{ first: 1, last: 1, size: null, hidden: true, group: null }],
      tall: [cell(3, 1, { value: 'x'.repeat(31) })],
    });

    expect(tallest(drawn, into).size).toBe(0);
  });
});
