import type { StyleValues } from '@yxl-vscode/spec';
import { format as excel } from 'numfmt';
import type { DrawnCell, DrawnMerge, DrawnRun } from './protocol';

const EDGES = [
  ['left', 'borderLeft'],
  ['right', 'borderRight'],
  ['top', 'borderTop'],
  ['bottom', 'borderBottom'],
] as const;

/**
 * One cell as a `<td>`: what it says, and what it looks like saying it.
 *
 * Everything a spec can put on a cell that CSS has an answer for is answered
 * here, and nothing else is: the merge it anchors, the text it shows, and the
 * style it wears. Which style that is was decided before the drawing was sent.
 */
export function drawCell(
  cell: DrawnCell | undefined,
  merge: DrawnMerge | undefined,
): HTMLTableCellElement {
  const drawn = document.createElement('td');
  if (merge !== undefined) {
    drawn.colSpan = merge.right - merge.left + 1;
    drawn.rowSpan = merge.bottom - merge.top + 1;
  }

  if (cell === undefined) return drawn;

  if (cell.rich === null) drawn.textContent = shown(cell);
  else drawn.append(...cell.rich.map(run));

  if (cell.formula !== null) drawn.title = told(cell);
  if (cell.filledFrom !== null) drawn.classList.add('filled');
  apply(drawn, cell.style);
  return drawn;
}

/**
 * One run of a cell written in runs, wearing the font that run alone was given.
 *
 * Excel keeps a rich string's fonts on the string, so a run's look is not a
 * layer over the cell's — it is the run's own, and the cell's style is still
 * underneath it.
 */
function run(of: DrawnRun): HTMLElement {
  const piece = document.createElement('span');
  piece.textContent = of.text;
  apply(piece, of.style);
  return piece;
}

/**
 * What a cell shows.
 *
 * A formula shows as its own text, not as a result: nothing here computes, and
 * a preview that guessed at one would be inventing a number Excel had not
 * agreed to (ADR-014). A cached value beside it is what Excel would show, so it
 * wins.
 *
 * A number wears its format, so `0.085` under `0.0%` reads `8.5%` here as it
 * will in Excel. A pattern the formatter cannot read shows its own error rather
 * than throwing the view away.
 *
 * A cell **filled** by a `formulas:` range shows where it is filled from
 * instead. The range holds one formula, written as it applies at its anchor,
 * and Excel shifts the references per cell while nothing here does — printing
 * that text in every cell would be printing something false in all but one.
 */
function shown(cell: DrawnCell): string {
  if (typeof cell.value === 'number' && cell.format !== null) {
    return excel(cell.format, cell.value, { throws: false });
  }
  if (cell.value !== null) return String(cell.value);
  if (cell.formula === null) return '';

  return cell.filledFrom === null ? `=${cell.formula}` : `↧ ${cell.filledFrom}`;
}

/**
 * What the cell says about its own formula on hover.
 *
 * A cell of a filled range holds the formula as it applies at the range's
 * anchor; Excel shifts the relative references per cell and nothing here does,
 * so the view says where it is reading from rather than letting the text be
 * read as this cell's own.
 */
function told(cell: DrawnCell): string {
  const formula = `=${cell.formula ?? ''}`;
  if (cell.filledFrom === null) return formula;

  return `${formula} — filled from ${cell.filledFrom}; Excel shifts the references per cell`;
}

function apply(drawn: HTMLElement, style: StyleValues): void {
  if (style['font.bold'] === true) drawn.style.fontWeight = 'bold';
  if (style['font.italic'] === true) drawn.style.fontStyle = 'italic';
  if (style['font.underline'] === true) drawn.style.textDecoration = 'underline';
  if (style['font.strike'] === true) drawn.style.textDecoration = 'line-through';
  if (style['font.size'] !== undefined) drawn.style.fontSize = `${style['font.size']}pt`;
  if (style['font.name'] !== undefined) drawn.style.fontFamily = style['font.name'];
  if (style['font.color'] !== undefined) drawn.style.color = colour(style['font.color']);
  if (style.fill !== undefined) drawn.style.backgroundColor = colour(style.fill);
  if (style['align.horizontal'] !== undefined) drawn.style.textAlign = horizontal(style);
  if (style['align.vertical'] !== undefined) drawn.style.verticalAlign = vertical(style);
  if (style['align.wrap'] === true) drawn.style.whiteSpace = 'pre-wrap';

  for (const [side, property] of EDGES) {
    const line = style[`border.${side}.style`];
    if (line === undefined) continue;

    const edge = style[`border.${side}.color`];
    const drawnWith = edge === undefined ? 'currentColor' : colour(edge);
    drawn.style[property] = `${thickness(line)} solid ${drawnWith}`;
  }
}

/** A spec's colour is `RRGGBB` or `AARRGGBB`, and CSS wants the alpha last. */
function colour(hex: string): string {
  const digits = hex.startsWith('#') ? hex.slice(1) : hex;
  return digits.length === 8 ? `#${digits.slice(2)}${digits.slice(0, 2)}` : `#${digits}`;
}

function horizontal(style: StyleValues): string {
  const set = style['align.horizontal'];
  return set === 'fill' || set === 'distributed' ? 'justify' : (set ?? 'left');
}

function vertical(style: StyleValues): string {
  const set = style['align.vertical'];
  if (set === 'middle') return 'middle';
  return set === 'justify' || set === 'distributed' ? 'middle' : (set ?? 'bottom');
}

function thickness(line: string): string {
  if (line === 'hair') return '0.5px';
  if (line === 'medium' || line === 'double') return '2px';
  return line === 'thick' ? '3px' : '1px';
}
