// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { DrawnSparkline } from './protocol';
import { sparkline } from './sparkline';

function spark(of: Partial<DrawnSparkline> = {}): DrawnSparkline {
  return {
    type: 'line',
    points: [1, 4, 2],
    markers: false,
    high: false,
    low: false,
    axis: false,
    min: null,
    max: null,
    weight: null,
    color: null,
    colors: null,
    ...of,
  };
}

describe('a sparkline', () => {
  it('plots a line through its points, and nothing at all with no numbers to plot', () => {
    expect(sparkline(spark()).querySelector('polyline')?.getAttribute('points')).toBe(
      '0,12 30,0 60,8',
    );
    expect(sparkline(spark({ points: [null, null] })).childElementCount).toBe(0);
  });

  it('plots a column each, and a win or a loss as the sign alone', () => {
    const columns = sparkline(spark({ type: 'column', points: [1, 2] }));
    expect(columns.querySelectorAll('rect').length).toBe(2);

    const signs = sparkline(spark({ type: 'win_loss', points: [3, -1] }));
    const [win, loss] = [...signs.querySelectorAll('rect')];
    expect(win?.getAttribute('height')).toBe(loss?.getAttribute('height'));
    expect(Number(win?.getAttribute('y'))).toBeLessThan(Number(loss?.getAttribute('y')));
  });

  it('dots every point where it is asked to, and the highest and lowest in their own colours', () => {
    expect(sparkline(spark({ markers: true })).querySelectorAll('circle').length).toBe(3);

    const colors = { markers: null, high: '#aa0000', low: '#0000aa' };
    const picked = sparkline(spark({ high: true, low: true, colors }));
    const fills = [...picked.querySelectorAll('circle')].map((one) => one.getAttribute('fill'));
    expect(fills).toEqual(['#0000aa', '#aa0000']);
  });

  it('draws the axis at zero only where the points cross it', () => {
    expect(sparkline(spark({ axis: true, points: [-1, 2] })).querySelector('line')).not.toBeNull();
    expect(sparkline(spark({ axis: true, points: [1, 2] })).querySelector('line')).toBeNull();
  });
});
