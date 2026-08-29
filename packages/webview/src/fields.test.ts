import { describe, expect, it } from 'vitest';
import { plain, tabbed } from './fields';
import { cell } from './harness';
import type { DrawnCell } from './protocol';

const over = (top: number, left: number, bottom: number, right: number) => ({
  top,
  left,
  bottom,
  right,
});

describe('what one cell copies as', () => {
  it('is what it comes to, where something has computed it', () => {
    const computed = { kind: 'value', value: 4150000 } as const;
    expect(plain(cell(1, 1, { formula: 'SUM(B1:B2)', computed }))).toBe('4150000');
  });

  it('is the error where that is what it came to, as a spreadsheet shows one', () => {
    const computed = { kind: 'error', error: '#DIV/0!' } as const;
    expect(plain(cell(1, 1, { formula: 'A1/0', computed }))).toBe('#DIV/0!');
  });

  it('is what it holds where nothing has computed it — the value, then the formula', () => {
    expect(plain(cell(1, 1, { value: 'APAC' }))).toBe('APAC');
    expect(plain(cell(1, 1, { formula: 'SUM(B1:B2)' }))).toBe('=SUM(B1:B2)');
  });

  it('is the text of a cell written in runs, which is what it says', () => {
    const rich = [
      { text: 'Figures are ', style: {} },
      { text: 'unaudited', style: { 'font.italic': true } },
    ];
    expect(plain(cell(1, 1, { rich }))).toBe('Figures are unaudited');
  });

  it('is nothing for a cell that is not there', () => {
    expect(plain(undefined)).toBe('');
  });
});

describe('a rectangle as a spreadsheet reads one', () => {
  const cells: DrawnCell[] = [
    cell(1, 1, { value: 'Region' }),
    cell(1, 2, { value: 'Sold' }),
    cell(2, 1, { value: 'APAC' }),
    cell(2, 2, { value: 2400000 }),
  ];

  it('is tab-separated rows, in the order a reader goes through them', () => {
    expect(tabbed(cells, over(1, 1, 2, 2))).toBe('Region\tSold\nAPAC\t2400000');
  });

  it('leaves a cell nothing writes empty, and keeps its place in the row', () => {
    expect(tabbed([cell(1, 1, { value: 'one' })], over(1, 1, 2, 2))).toBe('one\t\n\t');
  });

  it('quotes a field that holds what a row or a field ends on', () => {
    const awkward = [cell(1, 1, { value: 'one\ttwo' }), cell(1, 2, { value: 'a "quoted" word' })];
    expect(tabbed(awkward, over(1, 1, 1, 2))).toBe('"one\ttwo"\t"a ""quoted"" word"');
  });
});
