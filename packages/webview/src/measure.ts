import type { StyleValues } from '@yxl-vscode/spec';
import { shown } from './cell';
import type { DrawnCell } from './protocol';
import { PADDING } from './window';

/** How wide a string is drawn in a font — the browser's own answer, injected so it can be stood in for. */
export type Ruler = (text: string, font: string) => number;

/** The face and size the grid draws in, which `view.css` sets and a cell's own style may replace. */
const GRID = { size: '11pt', family: 'Calibri, Aptos, "Segoe UI", system-ui, sans-serif' };

/** A canvas to measure against, or `null` where the view has none — jsdom and an old shell both. */
export function ruler(): Ruler | null {
  const face = document.createElement('canvas').getContext('2d');
  if (face === null) return null;

  return (text, font) => {
    face.font = font;
    return face.measureText(text).width;
  };
}

/** The CSS `font` a cell is drawn with, which is the font it has to be measured in. */
function fontOf(style: StyleValues): string {
  const parts = [
    style['font.italic'] === true ? 'italic' : '',
    style['font.bold'] === true ? 'bold' : '',
    style['font.size'] === undefined ? GRID.size : `${style['font.size']}pt`,
    style['font.name'] === undefined ? GRID.family : String(style['font.name']),
  ];

  return parts.filter((one) => one !== '').join(' ');
}

/**
 * How wide a column has to be to hold these cells, in pixels, or `null` where
 * none of them holds anything — the width Excel's own fit arrives at, measured
 * on the text as the grid draws it rather than counted in characters.
 */
export function widest(cells: readonly DrawnCell[], rule: Ruler): number | null {
  let wide: number | null = null;

  for (const cell of cells) {
    const text = cell.rich === null ? shown(cell) : cell.rich.map((run) => run.text).join('');
    if (text === '') continue;

    const font =
      cell.rich === null ? fontOf(cell.style) : fontOf(cell.rich[0]?.style ?? cell.style);
    wide = Math.max(wide ?? 0, rule(text, font) + PADDING);
  }

  return wide;
}
