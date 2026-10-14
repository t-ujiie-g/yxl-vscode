// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { sheet } from './harness';
import { type Laid, layers, paneAt, paned, sheetSize } from './panes';

const FROZEN = sheet({ freeze: { row: 3, col: 2 }, of: { rows: 40, columns: 20 } });

/** A clip's three distinct numbers — right edge twice, then bottom — rounded. */
function cutOf(box: HTMLElement): number[] {
  return [...box.style.clipPath.matchAll(/([\d.]+)px/g)]
    .slice(0, 3)
    .map((one) => Math.round(Number(one[1])));
}

const span = () => document.createElement('span');

describe('the pane a cell is in', () => {
  it('is one of four on a frozen sheet, by which side of each freeze line it is on', () => {
    const at = (row: number, col: number) => paneAt(FROZEN, { row, col });
    expect([at(1, 1), at(1, 2), at(3, 1), at(3, 2)]).toEqual([
      'corner',
      'rows',
      'columns',
      'scrolls',
    ]);
  });

  it('is the scrolling one everywhere on a sheet with no freeze', () => {
    expect(paneAt(sheet(), { row: 1, col: 1 })).toBe('scrolls');
  });
});

describe('the layers over the grid', () => {
  it('are one per pane with something in it, in drawing order, each holding what was laid in it', () => {
    const [one, two, three] = [span(), span(), span()];
    const laid: Laid[] = [
      ['corner', one],
      ['scrolls', two],
      ['corner', three],
    ];
    const drawn = layers(laid);

    expect(drawn.map((layer) => [layer.className, [...layer.children]])).toEqual([
      ['pane scrolls', [two]],
      ['pane corner', [one, three]],
    ]);
  });

  it('are none where nothing is laid', () => {
    expect(layers([])).toEqual([]);
  });
});

describe('what is drawn over every pane alike', () => {
  it('is drawn once where nothing is frozen, uncut', () => {
    const laid = paned(sheet(), 'paper', () => [span()]);
    expect(laid.map(([pane, box]) => [pane, box.className, box.style.clipPath])).toEqual([
      ['scrolls', 'paper', ''],
    ]);
  });

  it('is drawn once per pane, each frozen copy cut to its own', () => {
    const laid = paned(FROZEN, 'paper', () => [span()]);
    const whole = sheetSize(FROZEN);
    // The row numbers and column A across; the headings and rows 1 and 2 down.
    const wide = Math.round(44 + 64.01);
    const tall = 24 + 2 * 20;

    expect(laid.map(([pane, box]) => [pane, box.children.length, cutOf(box)])).toEqual([
      ['scrolls', 1, []],
      ['columns', 1, [wide, wide, Math.round(whole.height)]],
      ['rows', 1, [Math.round(whole.width), Math.round(whole.width), tall]],
      ['corner', 1, [wide, wide, tall]],
    ]);
  });
});

describe('how far a sheet reaches', () => {
  it('is every column and row the sheet has, past the headings and row numbers', () => {
    const { width, height } = sheetSize(FROZEN);
    expect([Math.round(width), height]).toEqual([Math.round(44 + 20 * 64.01), 24 + 40 * 20]);
  });
});
