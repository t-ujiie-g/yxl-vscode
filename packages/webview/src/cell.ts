import type { ScalarValue, StyleValues } from '@yxl-vscode/spec';
import { format as excel } from 'numfmt';
import type { DrawnCell, DrawnMerge, DrawnRun } from './protocol';

const EDGES = [
  ['left', 'border-left'],
  ['right', 'border-right'],
  ['top', 'border-top'],
  ['bottom', 'border-bottom'],
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
 * its format.
 */
export function shown(cell: DrawnCell): string {
  if (cell.computed?.kind === 'error') return cell.computed.error;

  const value = held(cell);
  if (value !== null) return formatted(value, cell.format);

  return cell.formula === null ? '' : `=${cell.formula}`;
}

/** What a format would make of the number a cell shows, or `null` where it shows none. */
export function underFormat(cell: DrawnCell, format: string): string | null {
  const value = held(cell);
  return typeof value === 'number' ? formatted(value, format) : null;
}

/** The value a cell shows: what was computed where there is one, else what the spec holds (ADR-014). */
function held(cell: DrawnCell): ScalarValue | null {
  return cell.computed?.kind === 'value' ? cell.computed.value : cell.value;
}

function formatted(value: ScalarValue, format: string | null): string {
  if (typeof value === 'number' && format !== null) return excel(format, value, { throws: false });
  return value === null ? '' : String(value);
}

/** The formula on hover, and where a filled cell is filled from. */
function told(cell: DrawnCell): string {
  const formula = `=${cell.formula ?? ''}`;
  const why = cell.computed?.kind === 'unsupported' ? ` — not computed: ${cell.computed.why}` : '';
  if (cell.filledFrom === null) return `${formula}${why}`;

  return `${formula} — filled from ${cell.filledFrom}${why}`;
}

/** The look as the inline CSS another spreadsheet reads off the clipboard (ADR-028). */
export function styleText(style: StyleValues): string {
  return declarations(style)
    .map(([name, value]) => `${name}: ${opaque(value)}`)
    .join('; ');
}

/** A cell's fill as an importer that reads no CSS takes one, or `null` where it has none (ADR-028). */
export function fillOf(style: StyleValues): string | null {
  return style.fill === undefined ? null : opaque(colour(style.fill));
}

/** The look a cell wears, as the CSS declarations that draw it. */
function declarations(style: StyleValues): [string, string][] {
  const css: [string, string][] = [];
  const put = (name: string, value: string): void => {
    css.push([name, value]);
  };

  if (style['font.bold'] === true) put('font-weight', 'bold');
  if (style['font.italic'] === true) put('font-style', 'italic');
  if (style['font.underline'] === true) put('text-decoration', 'underline');
  if (style['font.strike'] === true) put('text-decoration', 'line-through');
  if (style['font.size'] !== undefined) put('font-size', `${style['font.size']}pt`);
  if (style['font.name'] !== undefined) put('font-family', style['font.name']);
  if (style['font.color'] !== undefined) put('color', colour(style['font.color']));
  // `background`, not `background-color`: Excel's clipboard reader takes the
  // shorthand and passes over the long form, which is what ate the fill.
  if (style.fill !== undefined) put('background', colour(style.fill));
  if (style['align.horizontal'] !== undefined) put('text-align', horizontal(style));
  if (style['align.vertical'] !== undefined) put('vertical-align', vertical(style));
  if (style['align.wrap'] === true) put('white-space', 'pre-wrap');

  for (const [side, property] of EDGES) {
    const line = style[`border.${side}.style`];
    if (line === undefined) continue;

    const edge = style[`border.${side}.color`];
    const drawnWith = edge === undefined ? 'currentColor' : colour(edge);
    put(property, `${thickness(line)} solid ${drawnWith}`);
  }

  return css;
}

function apply(drawn: HTMLElement, style: StyleValues): void {
  for (const [name, value] of declarations(style)) drawn.style.setProperty(name, value);
}

/** A colour as another spreadsheet reads one: six digits, since a cell's fill has no alpha there. */
function opaque(value: string): string {
  return value.replace(/#([0-9a-fA-F]{6})[0-9a-fA-F]{2}\b/g, '#$1');
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
