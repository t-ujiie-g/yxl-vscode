// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { ACROSS, framed, frozen, marked, RAGGED } from './marks';

describe('a mark drawn as bars', () => {
  it('is one rectangle per bar, in a box a button can hold', () => {
    const svg = marked([{ x: 2, y: 2, width: 12 }]);

    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(svg.querySelectorAll('rect')).toHaveLength(1);
  });

  it('says nothing to a reader that cannot see it, since the button is named', () => {
    expect(marked([]).getAttribute('aria-hidden')).toBe('true');
  });

  it('takes the height a bar asks for, and 1.6 where it asks for none', () => {
    const svg = marked([
      { x: 1, y: 1, width: 14, height: 1 },
      { x: 2, y: 2, width: 12 },
    ]);
    const drawn = [...svg.querySelectorAll('rect')].map((one) => one.getAttribute('height'));

    expect(drawn).toEqual(['1', '1.6']);
  });
});

describe('the box a border mark is drawn in', () => {
  const faint = (sides: readonly string[]) => framed(sides).map((bar) => bar.faint === true);

  it('has every edge, with the ones it does not name standing back', () => {
    expect(framed(['top'])).toHaveLength(4);
    expect(faint(['top'])).toEqual([true, true, false, true]);
  });

  it('stands every edge out where every edge is named', () => {
    expect(faint(['left', 'right', 'top', 'bottom'])).toEqual([false, false, false, false]);
  });

  it('stands none out where none is named, which is the box a border comes off', () => {
    expect(faint([])).toEqual([true, true, true, true]);
  });

  it('draws the edge it names heavier, since at 16px an edge that is only lit reads as a box', () => {
    const [left] = framed(['left']);
    const [faintLeft] = framed([]);

    expect(left?.width).toBe(2.2);
    expect(faintLeft?.width).toBe(1);
  });
});

describe('the mark a frozen pane wears', () => {
  it('is the border box with the corner that stays and the two edges it splits along', () => {
    const bars = frozen();

    expect(bars).toHaveLength(7);
    expect(bars.filter((bar) => bar.faint !== true)).toHaveLength(2);
  });
});

describe('where the bars of an alignment mark sit', () => {
  it('is four across and ragged at one end, so the mark reads as text', () => {
    expect(ACROSS).toHaveLength(4);
    expect(RAGGED).toEqual([12, 8, 12, 8]);
  });
});
