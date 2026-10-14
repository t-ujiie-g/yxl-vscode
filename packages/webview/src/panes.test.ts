// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { sheet } from './harness';
import { holdPanes, paneAt, paned, paneLayer, sheetSize } from './panes';

const FROZEN = sheet({ freeze: { row: 3, col: 2 }, of: { rows: 40, columns: 20 } });

/** A clip's three distinct numbers — right edge twice, then bottom — rounded. */
function cutOf(layer: HTMLElement): number[] {
  return [...layer.style.clipPath.matchAll(/([\d.]+)px/g)]
    .slice(0, 3)
    .map((one) => Math.round(Number(one[1])));
}

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

describe("a pane's layer", () => {
  it('holds what it is given, and is cut only where it is asked to be', () => {
    const held = document.createElement('span');
    const whole = paneLayer('scrolls', [held]);
    const cut = paneLayer('columns', [], { x: 10, y: 20 });

    expect([whole.className, whole.firstChild === held, whole.style.clipPath]).toEqual([
      'pane scrolls',
      true,
      '',
    ]);
    expect(cut.style.clipPath).toBe('polygon(0 0, 10px 0, 10px 20px, 0 20px)');
  });
});

describe('what is drawn over every pane alike', () => {
  it('is drawn once where nothing is frozen', () => {
    expect(paned(sheet(), () => []).map((one) => one.className)).toEqual(['pane scrolls']);
  });

  it('is drawn once per pane, each frozen copy cut to its own', () => {
    const layers = paned(FROZEN, () => [document.createElement('span')]);
    const whole = sheetSize(FROZEN);
    // The row numbers and column A across; the headings and rows 1 and 2 down.
    const wide = Math.round(44 + 64.01);
    const tall = 24 + 2 * 20;

    expect(layers.map((one) => [one.className, one.children.length, cutOf(one)])).toEqual([
      ['pane scrolls', 1, []],
      ['pane columns', 1, [wide, wide, Math.round(whole.height)]],
      ['pane rows', 1, [Math.round(whole.width), Math.round(whole.width), tall]],
      ['pane corner', 1, [wide, wide, tall]],
    ]);
  });
});

describe('how far a sheet reaches', () => {
  it('is every column and row the sheet has, past the headings and row numbers', () => {
    const { width, height } = sheetSize(FROZEN);
    expect([Math.round(width), height]).toEqual([Math.round(44 + 20 * 64.01), 24 + 40 * 20]);
  });
});

describe('the panes held as the box scrolls', () => {
  it('moves each frozen pane by the scroll along the axes it freezes, and leaves the rest', () => {
    const box = document.createElement('div');
    box.append(...paned(FROZEN, () => []));
    box.scrollLeft = 40;
    box.scrollTop = 70;

    holdPanes(box);
    const held = (pane: string) => box.querySelector<HTMLElement>(`.pane.${pane}`)?.style.transform;
    expect([held('scrolls'), held('columns'), held('rows'), held('corner')]).toEqual([
      '',
      'translate(40px, 0)',
      'translate(0, 70px)',
      'translate(40px, 70px)',
    ]);
  });
});
