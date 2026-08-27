import { node, SVG } from './marks';
import type { DrawnSparkline } from './protocol';

/**
 * The sparkline a cell carries, drawn from the values the sheet holds and
 * scaled to its own points, which is how Excel scales one unless a group says
 * otherwise (`docs/spec.md` §19). Display only (ADR-014).
 */
export function sparkline(of: DrawnSparkline): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('viewBox', `0 0 ${PLOT.width} ${PLOT.height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const held = of.points.filter((point): point is number => point !== null);
  if (held.length === 0) return svg;

  const bounds = scaleOf(of, held);
  const colour = of.color ?? '#7a7a7a';
  if (of.axis && bounds.low < 0 && bounds.high > 0) {
    const y = at(0, bounds);
    svg.append(node('line', { x1: 0, y1: y, x2: PLOT.width, y2: y, stroke: '#c4c4c4' }));
  }

  for (const drawn of of.type === 'line'
    ? plotted(of, bounds, colour)
    : blocks(of, bounds, colour)) {
    svg.append(drawn);
  }
  return svg;
}

/** The box a sparkline is plotted in, in its own units; the cell scales it. */
const PLOT = { width: 60, height: 16 };

/** Where the points a sparkline plots run between: what the group asks for, else its own data. */
function scaleOf(of: DrawnSparkline, held: readonly number[]): Bounds {
  const low = of.min ?? Math.min(...held, 0);
  const high = of.max ?? Math.max(...held, 0);
  return { low, high: high === low ? low + 1 : high };
}

interface Bounds {
  readonly low: number;
  readonly high: number;
}

function at(value: number, bounds: Bounds): number {
  const along = (value - bounds.low) / (bounds.high - bounds.low);
  return PLOT.height - along * PLOT.height;
}

function alongX(index: number, many: number): number {
  return many < 2 ? PLOT.width / 2 : (PLOT.width * index) / (many - 1);
}

/** A `line` sparkline: the polyline, and a dot on every point or on the ones picked out. */
function plotted(of: DrawnSparkline, bounds: Bounds, colour: string): SVGElement[] {
  const many = of.points.length;
  const along = of.points
    .map((point, index) => (point === null ? '' : `${alongX(index, many)},${at(point, bounds)}`))
    .filter((one) => one !== '')
    .join(' ');

  const drawn: SVGElement[] = [
    node('polyline', {
      points: along,
      fill: 'none',
      stroke: colour,
      'stroke-width': of.weight ?? 1,
      'vector-effect': 'non-scaling-stroke',
    }),
  ];

  for (const [index, point] of of.points.entries()) {
    const mark = marked(of, point, colour);
    if (mark === null) continue;
    drawn.push(
      node('circle', { cx: alongX(index, many), cy: at(point ?? 0, bounds), r: 1.4, fill: mark }),
    );
  }
  return drawn;
}

/** A `column` or `win_loss` sparkline: one block per point, win/loss plotting only the sign. */
function blocks(of: DrawnSparkline, bounds: Bounds, colour: string): SVGElement[] {
  const many = of.points.length;
  const width = PLOT.width / Math.max(1, many);
  const base = of.type === 'win_loss' ? PLOT.height / 2 : at(0, bounds);

  return of.points.flatMap((point, index) => {
    if (point === null) return [];
    const top =
      of.type === 'win_loss'
        ? point >= 0
          ? base - PLOT.height * 0.4
          : base
        : Math.min(base, at(point, bounds));
    const height =
      of.type === 'win_loss' ? PLOT.height * 0.4 : Math.abs(at(point, bounds) - base) || 0.5;

    return [
      node('rect', {
        x: width * index + width * 0.15,
        y: top,
        width: width * 0.7,
        height,
        fill: marked(of, point, colour) ?? colour,
      }),
    ];
  });
}

/** The colour a point is picked out in, or `null` where it wears no mark of its own. */
function marked(of: DrawnSparkline, point: number | null, colour: string): string | null {
  if (point === null) return null;

  const held = of.points.filter((one): one is number => one !== null);
  if (of.high && point === Math.max(...held)) return of.colors?.high ?? colour;
  if (of.low && point === Math.min(...held)) return of.colors?.low ?? colour;

  return of.markers && of.type === 'line' ? (of.colors?.markers ?? colour) : null;
}
