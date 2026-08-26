// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { floats, sparkline } from './float';
import { sheet } from './harness';
import type { DrawnChart, DrawnImage, DrawnShape, DrawnSparkline } from './protocol';

const AT = { row: 2, col: 3, x: 0, y: 0 };

function chart(of: Partial<DrawnChart> = {}): DrawnChart {
  return {
    at: AT,
    size: { width: 480, height: 260 },
    type: 'column',
    title: null,
    legend: 'bottom',
    x: null,
    y: null,
    series: [{ name: 'Revenue', values: 'B2:B4', categories: 'A2:A4' }],
    ...of,
  };
}

function image(of: Partial<DrawnImage> = {}): DrawnImage {
  return {
    at: AT,
    size: { width: 120, height: 60 },
    file: 'logo.png',
    alt: null,
    why: null,
    ...of,
  };
}

function shape(of: Partial<DrawnShape> = {}): DrawnShape {
  return {
    at: AT,
    size: { width: 160, height: 160 },
    kind: 'cloud',
    text: [],
    fill: null,
    line: null,
    alt: null,
    ...of,
  };
}

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

/** Where a float lands in the scroller, past the headings and the columns before it. */
function placed(one: HTMLElement | null): { left: number; top: number; width: number } {
  const box = one?.querySelector<HTMLElement>('.float');
  if (box === undefined || box === null) throw new Error('nothing was drawn');

  const px = (said: string): number => Math.round(Number.parseFloat(said));
  return { left: px(box.style.left), top: px(box.style.top), width: px(box.style.width) };
}

describe('what floats over a sheet', () => {
  it('is nothing at all where the sheet carries none of it', () => {
    expect(floats(sheet())).toBeNull();
  });

  it('puts each one where its anchor cell sits, at the size it takes', () => {
    const drawn = floats(sheet({ charts: [chart()] }));
    expect(placed(drawn)).toEqual({ left: 162, top: 44, width: 480 });
  });

  it('moves an image in by the offset it is anchored with', () => {
    const drawn = floats(sheet({ images: [image({ at: { ...AT, x: 4, y: 6 } })] }));
    expect(placed(drawn).left).toBe(166);
  });
});

describe('a chart sketch', () => {
  it('is titled by its own title, and by its type where it has none', () => {
    const named = floats(sheet({ charts: [chart({ title: 'Revenue' })] }));
    expect(named?.querySelector('.title')?.textContent).toBe('Revenue');

    const bare = floats(sheet({ charts: [chart({ type: 'column_percent_stacked' })] }));
    expect(bare?.querySelector('.title')?.textContent).toBe('column percent stacked chart');
  });

  it('names each series in the legend, on the side the chart puts it', () => {
    const drawn = floats(sheet({ charts: [chart({ legend: 'top_right' })] }));
    expect(drawn?.querySelector('.legend')?.textContent).toBe('Revenue');
    expect(drawn?.querySelector('.float')?.classList.contains('legend-top-right')).toBe(true);
  });

  it('names a series by the cells it plots where the spec names it nothing', () => {
    const series = [{ name: null, values: 'B2:B4', categories: null }];
    const drawn = floats(sheet({ charts: [chart({ series })] }));
    expect(drawn?.querySelector('.legend')?.textContent).toBe('B2:B4');
  });

  it('draws no legend where the chart asks for none', () => {
    const drawn = floats(sheet({ charts: [chart({ legend: 'none' })] }));
    expect(drawn?.querySelector('.legend')).toBeNull();
  });

  it('says what it is and what it plots, since a sketch has no room to', () => {
    const drawn = floats(sheet({ charts: [chart({ y: { title: 'Amount', min: 0, max: null } })] }));
    const said = drawn?.querySelector<HTMLElement>('.float')?.title ?? '';
    expect(said).toContain('Excel draws it');
    expect(said).toContain('Revenue: B2:B4 over A2:A4');
    expect(said).toContain('Y axis: Amount from 0');
  });

  it('draws a mark of its own type: bars for a column, a line for a line, slices for a pie', () => {
    const marks = (type: string): string[] => {
      const drawn = floats(sheet({ charts: [chart({ type: type as DrawnChart['type'] })] }));
      return [...(drawn?.querySelectorAll('.plot svg > *') ?? [])].map((one) => one.tagName);
    };

    expect(new Set(marks('column'))).toEqual(new Set(['rect']));
    expect(new Set(marks('line'))).toEqual(new Set(['polyline']));
    expect(new Set(marks('scatter'))).toEqual(new Set(['circle']));
    expect(new Set(marks('pie'))).toEqual(new Set(['path']));
    expect(marks('doughnut')).toContain('circle');
  });

  it('puts the axis titles along the edges they belong to', () => {
    const axes = { x: { title: 'Region', min: null, max: null } };
    const drawn = floats(sheet({ charts: [chart(axes)] }));
    expect(drawn?.querySelector('.axis.x')?.textContent).toBe('Region');
    expect(drawn?.querySelector('.axis.y')).toBeNull();
  });
});

describe('an image plate', () => {
  it('is named by its alt text, falling back to the file', () => {
    expect(floats(sheet({ images: [image({ alt: 'A logo' })] }))?.textContent).toBe('A logo');
    expect(floats(sheet({ images: [image()] }))?.textContent).toBe('logo.png');
  });

  it('takes no room, and says why, where the file could not be measured', () => {
    const why = 'this format does not say its size';
    const drawn = floats(sheet({ images: [image({ size: null, why })] }));
    const box = drawn?.querySelector<HTMLElement>('.float');
    expect(box?.classList.contains('unmeasured')).toBe(true);
    expect(box?.style.width).toBe('');
    expect(box?.title).toContain(why);
  });
});

describe('a shape', () => {
  it('is drawn as the geometry it names, in the colours the spec asks for', () => {
    const line = { color: '#333333', width: 3 };
    const drawn = floats(sheet({ shapes: [shape({ kind: 'hexagon', fill: '#1F77B4', line })] }));
    const figure = drawn?.querySelector('.float.shape svg > *');
    expect(figure?.tagName).toBe('polygon');
    expect(figure?.getAttribute('fill')).toBe('#1F77B4');
    expect(figure?.getAttribute('stroke')).toBe('#333333');
    expect(figure?.getAttribute('stroke-width')).toBe('4');
  });

  it('is neither filled nor outlined where the spec gives it neither, as Excel leaves it', () => {
    const figure = floats(sheet({ shapes: [shape()] }))?.querySelector('.float.shape svg > *');
    expect(figure?.getAttribute('fill')).toBe('none');
    expect(figure?.getAttribute('stroke')).toBe('none');
  });

  it('draws a geometry it has no outline for as a rectangle rather than nothing', () => {
    const drawn = floats(sheet({ shapes: [shape({ kind: 'unheard-of' })] }));
    expect(drawn?.querySelector('.float.shape svg > *')?.tagName).toBe('polygon');
  });

  it('lays each line of text over it, wearing the font that line was given', () => {
    const text = [{ text: 'Approved', style: { 'font.bold': true } }] as const;
    const drawn = floats(sheet({ shapes: [shape({ text })] }));
    const said = drawn?.querySelector<HTMLElement>('.wording div');
    expect(said?.textContent).toBe('Approved');
    expect(said?.style.fontWeight).toBe('bold');
  });
});

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
