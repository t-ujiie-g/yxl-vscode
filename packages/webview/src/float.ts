import { apply } from './cell';
import { node, SVG } from './marks';
import { gutterOf } from './outline';
import type {
  DrawnAt,
  DrawnChart,
  DrawnChartAxis,
  DrawnImage,
  DrawnRun,
  DrawnShape,
  DrawnSheet,
} from './protocol';
import { type Asks, GUTTER, HEADING } from './showing';
import { across, down, landing, pixelsOf } from './window';
import { chrome } from './worded';

/**
 * Everything that floats above a sheet, laid over the grid where it sits and at
 * the size it takes. A sketch of each, never Excel's rendering of one (ADR-029).
 */
export function floats(sheet: DrawnSheet, asks: Asks): HTMLElement | null {
  const drawn = [
    ...sheet.charts.map((one) => dragged(chart(sheet, one), sheet, one, asks)),
    ...sheet.images.map((one) => dragged(image(sheet, one), sheet, one, asks)),
    ...sheet.shapes.map((one) => dragged(shape(sheet, one), sheet, one, asks)),
  ];
  if (drawn.length === 0) return null;

  const layer = document.createElement('div');
  layer.className = 'floats';
  layer.append(...drawn);
  return layer;
}

/** What a float carries for a drag to act on: where it hangs from, and the entry it was drawn from. */
interface Draggable {
  readonly node: string;
  readonly at: DrawnAt;
  readonly size: { readonly width: number; readonly height: number } | null;
}

/** A float made to move and to resize, each sending once on the way up: every step would be an edit. */
function dragged(drawn: HTMLElement, sheet: DrawnSheet, one: Draggable, asks: Asks): HTMLElement {
  drawn.addEventListener('mousedown', (down: MouseEvent) => {
    if (down.button !== 0) return;
    down.preventDefault();

    const from = { left: pixels(drawn.style.left), top: pixels(drawn.style.top) };
    const start = { x: down.clientX, y: down.clientY };
    let put = from;

    const moved = (at: MouseEvent): void => {
      put = { left: from.left + at.clientX - start.x, top: from.top + at.clientY - start.y };
      drawn.style.left = `${put.left}px`;
      drawn.style.top = `${put.top}px`;
    };

    const up = (): void => {
      document.removeEventListener('mousemove', moved);
      document.removeEventListener('mouseup', up);
      if (put.left === from.left && put.top === from.top) return;

      // The corner lands where the drop is, so the offset the entry already
      // carries comes off before the cell under it is looked up.
      asks.moveFloat(
        one.node,
        landing(sheet, {
          left: put.left - gutterOf(sheet, 'row') - GUTTER - one.at.x,
          top: put.top - gutterOf(sheet, 'column') - HEADING - one.at.y,
        }),
      );
    };

    document.addEventListener('mousemove', moved);
    document.addEventListener('mouseup', up);
  });

  if (one.size !== null) drawn.append(grip(drawn, one, asks));
  return drawn;
}

/** The corner a float is resized by, which writes its extent rather than scaling a picture. */
function grip(drawn: HTMLElement, one: Draggable, asks: Asks): HTMLElement {
  const held = document.createElement('span');
  held.className = 'grip';

  held.addEventListener('mousedown', (down: MouseEvent) => {
    down.preventDefault();
    down.stopPropagation();

    const from = one.size ?? { width: 0, height: 0 };
    const start = { x: down.clientX, y: down.clientY };
    let size = from;

    const moved = (at: MouseEvent): void => {
      size = {
        width: Math.max(LEAST, from.width + at.clientX - start.x),
        height: Math.max(LEAST, from.height + at.clientY - start.y),
      };
      drawn.style.width = `${size.width}px`;
      drawn.style.height = `${size.height}px`;
    };

    const up = (): void => {
      document.removeEventListener('mousemove', moved);
      document.removeEventListener('mouseup', up);
      if (size.width !== from.width || size.height !== from.height) {
        asks.sizeFloat(one.node, size);
      }
    };

    document.addEventListener('mousemove', moved);
    document.addEventListener('mouseup', up);
  });

  return held;
}

/** The smallest a drag may leave a float, so the corner it was dragged by stays there. */
const LEAST = 16;

/** A length this view wrote itself, read back; `offsetLeft` is the browser's and is not laid out yet. */
function pixels(said: string): number {
  return Number.parseFloat(said) || 0;
}

/** One float's box, put where its anchor cell and its offset say, at the extent it takes. */
function box(
  sheet: DrawnSheet,
  at: { row: number; col: number; x: number; y: number },
  size: { width: number; height: number } | null,
  kind: string,
): HTMLElement {
  const drawn = document.createElement('div');
  drawn.className = `float ${kind}`;
  drawn.style.left = `${gutterOf(sheet, 'row') + GUTTER + across(sheet, at.col) + at.x}px`;
  drawn.style.top = `${gutterOf(sheet, 'column') + HEADING + down(sheet, at.row) + at.y}px`;
  if (size !== null) {
    drawn.style.width = `${size.width}px`;
    drawn.style.height = `${size.height}px`;
  }
  return drawn;
}

/** A chart as an outline, a title, a legend and a mark of its type — the sketch ADR-029 asks for. */
function chart(sheet: DrawnSheet, one: DrawnChart): HTMLElement {
  const drawn = box(sheet, one.at, one.size, 'chart');
  drawn.title = chartSaid(one);
  if (one.legend !== 'none') drawn.classList.add(`legend-${one.legend.replace('_', '-')}`);

  const head = document.createElement('div');
  head.className = 'title';
  head.textContent = one.title ?? `${spelled(one.type)} chart`;
  drawn.append(head);

  const plot = document.createElement('div');
  plot.className = 'plot';
  plot.append(emblem(one.type, one.series.length));
  drawn.append(plot);

  if (one.legend !== 'none') drawn.append(legend(one));
  const axes = axisTitles(one);
  if (axes !== null) drawn.append(axes);

  return drawn;
}

/** What a chart is, said in full where the sketch has no room: its type, its ranges, and its axes. */
function chartSaid(one: DrawnChart): string {
  const lines = [chrome('view.a-chart', { type: spelled(one.type) })];

  for (const each of one.series) {
    const name = each.name ?? each.values;
    lines.push(
      each.categories === null
        ? `${name}: ${each.values}`
        : chrome('view.chart-over', {
            name,
            values: each.values,
            categories: each.categories,
          }),
    );
  }

  const said = [axisSaid('X', one.x), axisSaid('Y', one.y)].filter((line) => line !== '');
  return [...lines, ...said].join('\n');
}

function axisSaid(which: string, axis: DrawnChartAxis | null): string {
  if (axis === null) return '';

  const ends = [
    axis.min === null ? '' : chrome('view.chart-from', { min: axis.min }),
    axis.max === null ? '' : chrome('view.chart-to', { max: axis.max }),
  ].filter((one) => one !== '');

  return chrome('view.chart-axis', {
    which,
    title: axis.title === null ? '' : ` ${axis.title}`,
    ends: ends.length === 0 ? '' : ` ${ends.join(' ')}`,
  });
}

/** The axis titles a chart writes, along the edges they belong to. */
function axisTitles(one: DrawnChart): HTMLElement | null {
  const x = one.x?.title ?? null;
  const y = one.y?.title ?? null;
  if (x === null && y === null) return null;

  const drawn = document.createElement('div');
  drawn.className = 'axes';
  for (const [which, title] of [
    ['y', y],
    ['x', x],
  ] as const) {
    if (title === null) continue;
    const said = document.createElement('span');
    said.className = `axis ${which}`;
    said.textContent = title;
    drawn.append(said);
  }
  return drawn;
}

/** The legend, on the side the chart puts it: one entry per series, named as the spec names it. */
function legend(one: DrawnChart): HTMLElement {
  const drawn = document.createElement('div');
  drawn.className = 'legend';

  for (const [at, each] of one.series.entries()) {
    const entry = document.createElement('span');
    entry.className = 'entry';

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = tone(at);
    entry.append(swatch, document.createTextNode(each.name ?? each.values));
    drawn.append(entry);
  }

  return drawn;
}

/** The greys a sketch's series are told apart by; none of Excel's own palette (ADR-029). */
function tone(at: number): string {
  const greys = ['#7a7a7a', '#a8a8a8', '#5c5c5c', '#c4c4c4', '#8f8f8f'];
  return greys[at % greys.length] ?? '#7a7a7a';
}

/** A mark of the chart's own type, drawn from the same few greys and standing for nothing else. */
function emblem(type: string, series: number): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 100 60');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const shape of marks(type, Math.max(1, Math.min(series, 3)))) svg.append(shape);
  return svg;
}

const HEIGHTS = [0.45, 0.8, 0.3, 0.65, 0.55];

function marks(type: string, series: number): SVGElement[] {
  if (type.startsWith('column')) return columns(series);
  if (type.startsWith('bar')) return bars(series);
  if (type.startsWith('area')) return areas(series);
  if (type === 'line' || type === 'radar') return lines(series);
  if (type === 'scatter') return dots(series);
  return wedges(type === 'doughnut');
}

function columns(series: number): SVGElement[] {
  const drawn: SVGElement[] = [];
  const width = 100 / (HEIGHTS.length * series + HEIGHTS.length);
  for (const [at, height] of HEIGHTS.entries()) {
    for (let one = 0; one < series; one += 1) {
      const tall = 60 * height * (1 - one * 0.2);
      const x = width * (at * (series + 1) + one + 0.5);
      drawn.push(
        node('rect', { x, y: 60 - tall, width: width * 0.9, height: tall, fill: tone(one) }),
      );
    }
  }
  return drawn;
}

function bars(series: number): SVGElement[] {
  const drawn: SVGElement[] = [];
  const height = 60 / (HEIGHTS.length * series + HEIGHTS.length);
  for (const [at, length] of HEIGHTS.entries()) {
    for (let one = 0; one < series; one += 1) {
      const wide = 100 * length * (1 - one * 0.2);
      const y = height * (at * (series + 1) + one + 0.5);
      drawn.push(node('rect', { x: 0, y, width: wide, height: height * 0.9, fill: tone(one) }));
    }
  }
  return drawn;
}

/** Where a series' points sit across the plot, so a line and an area agree with the columns. */
function points(series: number): string[] {
  return Array.from({ length: series }, (_, one) =>
    HEIGHTS.map((height, at) => {
      const x = (100 * at) / (HEIGHTS.length - 1);
      return `${x},${60 - 60 * height * (1 - one * 0.2)}`;
    }).join(' '),
  );
}

function lines(series: number): SVGElement[] {
  return points(series).map((along, one) =>
    node('polyline', { points: along, fill: 'none', stroke: tone(one), 'stroke-width': 2 }),
  );
}

function areas(series: number): SVGElement[] {
  return points(series).map((along, one) =>
    node('polygon', { points: `0,60 ${along} 100,60`, fill: tone(one), 'fill-opacity': 0.7 }),
  );
}

function dots(series: number): SVGElement[] {
  const drawn: SVGElement[] = [];
  for (let one = 0; one < series; one += 1) {
    for (const [at, height] of HEIGHTS.entries()) {
      const x = (100 * at) / (HEIGHTS.length - 1);
      drawn.push(
        node('circle', {
          cx: Math.min(97, Math.max(3, x)),
          cy: 60 - 60 * height * (1 - one * 0.2),
          r: 3,
          fill: tone(one),
        }),
      );
    }
  }
  return drawn;
}

/** A pie's three slices, or a doughnut's — one series, as Excel draws only the first. */
function wedges(hollow: boolean): SVGElement[] {
  const parts = [0, 0.45, 0.75, 1];
  const drawn = parts.slice(0, -1).map((from, at) => {
    const to = parts[at + 1] ?? 1;
    return node('path', { d: slice(from, to), fill: tone(at) });
  });

  if (hollow) drawn.push(node('circle', { cx: 50, cy: 30, r: 11, fill: '#ffffff' }));
  return drawn;
}

function slice(from: number, to: number): string {
  const at = (turn: number): string => {
    const angle = (turn - 0.25) * 2 * Math.PI;
    return `${50 + 26 * Math.cos(angle)},${30 + 26 * Math.sin(angle)}`;
  };
  return `M 50,30 L ${at(from)} A 26,26 0 ${to - from > 0.5 ? 1 : 0} 1 ${at(to)} Z`;
}

/** An image as the plate it takes up, marked and named; the picture itself is Excel's to draw (ADR-029). */
function image(sheet: DrawnSheet, one: DrawnImage): HTMLElement {
  const drawn = box(sheet, one.at, one.size, 'image');
  if (one.size === null) drawn.classList.add('unmeasured');
  drawn.title = [one.alt, one.file, one.why].filter((said) => said !== null).join('\n');
  drawn.append(picture());

  // A name in a plate too small to hold it clips to a word that says less than
  // the mark does; the hover still has it.
  if (one.size === null || (one.size.width >= NAMED.width && one.size.height >= NAMED.height)) {
    const said = document.createElement('span');
    said.className = 'label';
    said.textContent = one.alt ?? one.file;
    drawn.append(said);
  }

  return drawn;
}

/** The smallest plate a file name fits in, past which the mark stands alone. */
const NAMED = { width: 112, height: 44 };

/** The mark a plate wears: a picture, in the same greys the rest of a sketch is drawn in. */
function picture(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'mark');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');

  svg.append(
    node('rect', {
      x: 1.5,
      y: 3.5,
      width: 21,
      height: 17,
      rx: 2,
      fill: 'none',
      stroke: '#8f8f8f',
      'stroke-width': 1.5,
    }),
    node('circle', { cx: 8, cy: 9, r: 2, fill: '#8f8f8f' }),
    node('path', { d: 'M 3 19 L 10 12 L 15 17 L 18 14 L 21 17 L 21 19 Z', fill: '#8f8f8f' }),
  );
  return svg;
}

/** A shape as the geometry it names, filled and outlined as the spec asks (`docs/spec.md` §18). */
function shape(sheet: DrawnSheet, one: DrawnShape): HTMLElement {
  const drawn = box(sheet, one.at, one.size, 'shape');
  if (one.alt !== null) drawn.title = one.alt;

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const width = one.line?.width ?? 0;
  const figure = geometry(one.kind);
  figure.setAttribute('fill', one.fill ?? 'none');
  figure.setAttribute('fill-rule', 'evenodd');
  figure.setAttribute('stroke', one.line?.color ?? 'none');
  // A stroke is written in points over a box scaled to the shape's own pixels.
  figure.setAttribute('vector-effect', 'non-scaling-stroke');
  figure.setAttribute('stroke-width', String(pixelsOf(width)));
  svg.append(figure);
  drawn.append(svg);

  if (one.text.length > 0) drawn.append(wording(one.text));
  return drawn;
}

function wording(lines: readonly DrawnRun[]): HTMLElement {
  const said = document.createElement('div');
  said.className = 'wording';

  for (const line of lines) {
    const one = document.createElement('div');
    one.textContent = line.text;
    apply(one, line.style);
    said.append(one);
  }

  return said;
}

/** A regular polygon's points, its first corner at the top, in a 100 × 100 box. */
function regular(sides: number): string {
  return Array.from({ length: sides }, (_, at) => {
    const angle = (at / sides - 0.25) * 2 * Math.PI;
    return `${50 + 50 * Math.cos(angle)},${50 + 50 * Math.sin(angle)}`;
  }).join(' ');
}

/** A five-pointed star, its points alternating out and in. */
function star(): string {
  return Array.from({ length: 10 }, (_, at) => {
    const radius = at % 2 === 0 ? 50 : 20;
    const angle = (at / 10 - 0.25) * 2 * Math.PI;
    return `${50 + radius * Math.cos(angle)},${50 + radius * Math.sin(angle)}`;
  }).join(' ');
}

const RECTANGLE = '0,0 100,0 100,100 0,100';

const POLYGONS: Record<string, string> = {
  rectangle: RECTANGLE,
  triangle: '50,0 100,100 0,100',
  diamond: regular(4),
  parallelogram: '25,0 100,0 75,100 0,100',
  trapezoid: '25,0 75,0 100,100 0,100',
  pentagon: regular(5),
  hexagon: regular(6),
  octagon: regular(8),
  decagon: regular(10),
  star_5: star(),
  plus: '35,0 65,0 65,35 100,35 100,65 65,65 65,100 35,100 35,65 0,65 0,35 35,35',
  chevron: '0,0 75,0 100,50 75,100 0,100 25,50',
};

const PATHS: Record<string, string> = {
  ellipse: 'M 50,0 A 50,50 0 1 1 49.99,0 Z',
  cube: 'M 0,25 L 25,0 L 100,0 L 100,75 L 75,100 L 0,100 Z M 0,25 L 75,25 L 100,0 M 75,25 L 75,100',
  can: 'M 0,15 A 50,15 0 0 1 100,15 L 100,85 A 50,15 0 0 1 0,85 Z M 0,15 A 50,15 0 0 0 100,15',
  donut: 'M 50,0 A 50,50 0 1 1 49.99,0 Z M 50,28 A 22,22 0 1 0 50.01,28 Z',
  frame: 'M 0,0 H 100 V 100 H 0 Z M 18,18 V 82 H 82 V 18 Z',
  heart:
    'M 50,100 C 0,62 0,20 25,10 C 40,4 50,16 50,26 C 50,16 60,4 75,10 C 100,20 100,62 50,100 Z',
  moon: 'M 70,2 A 50,50 0 1 0 70,98 A 40,50 0 1 1 70,2 Z',
  sun: 'M 50,22 A 28,28 0 1 1 49.99,22 Z M 50,0 L 56,14 L 44,14 Z M 50,100 L 44,86 L 56,86 Z M 0,50 L 14,44 L 14,56 Z M 100,50 L 86,56 L 86,44 Z',
  cloud:
    'M 25,85 A 22,22 0 0 1 22,42 A 26,26 0 0 1 70,30 A 20,20 0 0 1 82,68 A 18,18 0 0 1 75,85 Z',
  pie: 'M 50,50 L 50,0 A 50,50 0 1 1 0,50 Z',
  line: 'M 0,100 L 100,0',
};

/** The preset geometry a shape names, drawn as an outline of it and not as DrawingML's own (ADR-029). */
function geometry(kind: string): SVGElement {
  const polygon = POLYGONS[kind];
  if (polygon !== undefined) return node('polygon', { points: polygon });

  const path = PATHS[kind];
  return path === undefined ? node('polygon', { points: RECTANGLE }) : node('path', { d: path });
}

/** How a chart type reads in a sentence: `column_percent_stacked` is three words. */
function spelled(type: string): string {
  return type.replace(/_/g, ' ');
}
