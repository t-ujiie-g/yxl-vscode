import { BORDER_EDGES } from '@yxl-vscode/spec';

export interface Bar {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height?: number;
  readonly faint?: boolean;
}

const SVG = 'http://www.w3.org/2000/svg';

/** A mark drawn as the bars it stands for — of text, or of the box a border is put round. */
export function marked(bars: readonly Bar[]): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');

  for (const bar of bars) {
    const drawn = document.createElementNS(SVG, 'rect');
    drawn.setAttribute('x', String(bar.x));
    drawn.setAttribute('y', String(bar.y));
    drawn.setAttribute('width', String(bar.width));
    drawn.setAttribute('height', String(bar.height ?? 1.6));
    drawn.setAttribute('rx', '0.6');
    if (bar.faint === true) drawn.setAttribute('class', 'faint');
    svg.append(drawn);
  }

  return svg;
}

/** Where the bars of a text-alignment mark sit: four across the box, three stacked down it, ragged at one end. */
export const ACROSS = [2, 5.6, 9.2, 12.8];
export const DOWN = [0, 2.8, 5.6];
export const RAGGED = [12, 8, 12, 8];

/** The mark a frozen pane wears: the corner that stays, filled in, and the two edges it is split along. */
export function frozen(): Bar[] {
  return [
    ...framed([]),
    { x: 2, y: 2, width: 4, height: 4, faint: true },
    { x: 1, y: 6, width: 14, height: 1.6 },
    { x: 6, y: 1, width: 1.6, height: 14 },
  ];
}

/** The box a border mark is drawn in, with the edges it puts a line on drawn heavier than the rest. */
export function framed(sides: readonly string[]): Bar[] {
  const box = {
    top: { x: 1, y: 1, width: 14, height: 1 },
    bottom: { x: 1, y: 14, width: 14, height: 1 },
    left: { x: 1, y: 1, width: 1, height: 14 },
    right: { x: 14, y: 1, width: 1, height: 14 },
  };

  return BORDER_EDGES.map((side) => {
    const lit = sides.includes(side);
    const thick = side === 'top' || side === 'bottom' ? { height: lit ? 2.2 : 1 } : {};
    const wide = side === 'left' || side === 'right' ? { width: lit ? 2.2 : 1 } : {};
    return { ...box[side], ...thick, ...wide, faint: !lit };
  });
}
