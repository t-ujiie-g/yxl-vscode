import type { ScalarValue, StyleValues } from '@yxl-vscode/spec';
import { format as excel } from 'numfmt';
import type { DrawnCell, DrawnMerge, DrawnRun } from './protocol';

const EDGES = [
  ['left', 'borderLeft'],
  ['right', 'borderRight'],
  ['top', 'borderTop'],
  ['bottom', 'borderBottom'],
] as const;

/** One cell as a `<td>`: what it says, and the look it was sent wearing. */
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
  if (cell.overridden) drawn.classList.add('overridden');
  if (cell.editable !== 'direct') drawn.classList.add('locked');

  const about = [
    cell.overridden ? 'written as an override' : '',
    cell.editable === 'direct' ? '' : `cannot be typed into: ${standing(cell.editable)}`,
  ].filter((one) => one !== '');
  if (about.length > 0)
    drawn.title = [drawn.title, ...about].filter((one) => one !== '').join(' — ');
  if (cell.computed?.kind === 'error') drawn.classList.add('problem');
  else if (cell.computed === null && cell.filledFrom !== null) drawn.classList.add('filled');
  apply(drawn, cell.style);
  return drawn;
}

/**
 * Type into a cell. Without a `seed` the box holds what the spec holds — the
 * formula, not its result; with one, that character. Enter sends, Escape and
 * clicking away leave the cell alone.
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
    // Every box in the cell: one left behind is a white rectangle over the grid.
    for (const other of cell.querySelectorAll('.typing')) other.remove();
    cell.classList.remove('editing');
  };

  box.addEventListener('keydown', (event) => {
    event.stopPropagation();

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

  for (const other of cell.querySelectorAll('.typing')) other.remove();
  cell.classList.add('editing');
  cell.append(box);
  box.focus({ preventScroll: true });
  if (seed === undefined) box.select();
}

/** What the spec holds for this cell, as a reader would type it. */
function written(cell: DrawnCell | undefined): string {
  if (cell === undefined) return '';
  if (cell.formula !== null) return `=${cell.formula}`;

  return cell.value === null ? '' : String(cell.value);
}

/** What stands between this cell and being typed into. */
function standing(editable: Exclude<DrawnCell['editable'], 'direct'>): string {
  return editable === 'external'
    ? 'its value comes from a file beside the spec'
    : 'more than one thing could change to make that edit';
}

/** One run of a rich cell, wearing its own font over the cell's style. */
function run(of: DrawnRun): HTMLElement {
  const piece = document.createElement('span');
  piece.textContent = of.text;
  apply(piece, of.style);
  return piece;
}

/**
 * What a cell shows: a computed result, else the cached value, else the formula
 * itself — never a number that is not the workbook's (ADR-014). A number wears
 * its format; a filled cell that was not computed says where it is filled from.
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

/** The formula on hover; a filled cell holds it as it applies at the anchor, so it says so. */
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
