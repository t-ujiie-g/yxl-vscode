import type { StyleValues } from '@yxl-vscode/spec';
import { drawCell } from './cell';
import type { DrawnCell, DrawnSheet } from './protocol';
import { shown } from './shown';
import { PADDING, widthOf } from './window';

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

/**
 * How tall each row a sheet's `tall` cells sit on has to be, in pixels: each
 * cell drawn at its column's width off the page and measured, as Excel fits a row.
 */
export function tallest(sheet: DrawnSheet, into: HTMLElement): Map<number, number> {
  const rows = new Map<number, number>();
  const taking = (row: number, height: number) => {
    if (height > (rows.get(row) ?? 0)) rows.set(row, height);
  };

  const box = document.createElement('div');
  box.className = 'measuring';
  const pending: { row: number; key: string; line: HTMLElement }[] = [];
  for (const cell of sheet.tall) {
    const wide = widthOf(sheet, cell.col);
    if (wide === 0) continue;

    const key = `${wide}:${JSON.stringify({ ...cell, row: 0, col: 0 })}`;
    const known = measured.get(key);
    if (known !== undefined) {
      taking(cell.row, known);
      continue;
    }

    const table = document.createElement('table');
    table.className = 'grid';
    table.style.width = `${wide}px`;
    const line = document.createElement('tr');
    line.append(drawCell(cell, undefined, 0, sheet.protect !== null));
    table.append(line);
    box.append(table);
    pending.push({ row: cell.row, key, line });
  }
  if (pending.length === 0) return rows;

  into.append(box);
  if (measured.size + pending.length > REMEMBERED) measured.clear();
  for (const { row, key, line } of pending) {
    measured.set(key, line.offsetHeight);
    taking(row, line.offsetHeight);
  }
  box.remove();

  return rows;
}

const measured = new Map<string, number>();

const REMEMBERED = 50_000;
