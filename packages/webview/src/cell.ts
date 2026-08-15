import type { ScalarValue, StyleValues } from '@yxl-vscode/spec';
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
  if (cell.computed?.kind === 'error') drawn.classList.add('problem');
  else if (cell.computed === null && cell.filledFrom !== null) drawn.classList.add('filled');
  apply(drawn, cell.style);
  return drawn;
}

/**
 * Type into a cell, over the top of what it shows.
 *
 * Opened without a `seed`, the box holds what the *spec* holds — a formula as
 * `=SUM(A1:A2)`, not as the number it came to — because that is what the reader
 * is about to change. Opened by typing a character, it holds that character:
 * typing over a cell replaces it, and nobody presses anything first.
 *
 * Enter sends it, Escape and clicking away leave the cell alone: a gesture that
 * only *might* have been an edit is not one (ADR-001).
 */
export function typeInto(
  cell: HTMLTableCellElement,
  drawn: DrawnCell | undefined,
  seed: string | undefined,
  done: (text: string) => void,
): void {
  const box = document.createElement('input');
  box.type = 'text';
  box.className = 'typing';
  box.value = seed ?? written(drawn);

  let sent = false;
  const leave = (): void => {
    box.remove();
    cell.classList.remove('editing');
  };

  box.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      sent = true;
      done(box.value);
      leave();
    }
    if (event.key === 'Escape') leave();
  });
  box.addEventListener('blur', () => {
    if (!sent) leave();
  });

  cell.classList.add('editing');
  cell.append(box);
  box.focus();
  if (seed === undefined) box.select();
}

/** What the spec holds for this cell, as a reader would type it. */
function written(cell: DrawnCell | undefined): string {
  if (cell === undefined) return '';
  if (cell.formula !== null) return `=${cell.formula}`;

  return cell.value === null ? '' : String(cell.value);
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
 * A **computed** formula shows its result, which is the point of computing it,
 * and the formula itself is a hover away. A formula that could not be computed
 * shows as its own text instead — never as a number, because a number that is
 * not the workbook's number is worse than no number at all (ADR-014).
 *
 * A cached value beside a formula is what Excel would show until it recomputes,
 * so it stands in where nothing was computed here.
 *
 * A number wears its format, so `0.085` under `0.0%` reads `8.5%` here as it
 * will in Excel. A pattern the formatter cannot read shows its own error rather
 * than throwing the view away.
 *
 * A cell **filled** by a `formulas:` range that was not computed shows where it
 * is filled from. The range holds one formula, written as it applies at its
 * anchor, and printing that text in every cell would be printing something
 * false in all but one.
 */
function shown(cell: DrawnCell): string {
  const computed = cell.computed;
  if (computed?.kind === 'error') return computed.error;
  if (computed?.kind === 'value') return formatted(computed.value, cell.format);

  if (cell.value !== null) return formatted(cell.value, cell.format);
  if (cell.formula === null) return '';

  return cell.filledFrom === null ? `=${cell.formula}` : `↧ ${cell.filledFrom}`;
}

function formatted(value: ScalarValue, format: string | null): string {
  if (typeof value === 'number' && format !== null) return excel(format, value, { throws: false });
  return value === null ? '' : String(value);
}

/**
 * What the cell says about its own formula on hover.
 *
 * A cell of a filled range holds the formula as it applies at the range's
 * anchor, so it says where it is reading from as well — the same formula means
 * a different thing one row down, and it is Excel that shifts it.
 */
function told(cell: DrawnCell): string {
  const formula = `=${cell.formula ?? ''}`;
  const why = cell.computed?.kind === 'unsupported' ? ` — not computed: ${cell.computed.why}` : '';
  if (cell.filledFrom === null) return `${formula}${why}`;

  return `${formula} — filled from ${cell.filledFrom}; Excel shifts the references per cell${why}`;
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
