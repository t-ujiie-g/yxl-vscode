import { BORDER_EDGES, type ScalarValue, type StyleValues } from '@yxl-vscode/spec';
import { painted } from '@yxl-vscode/units';
import { format as excel } from 'numfmt';
import { iconOf } from './icons';
import type { DrawnBar, DrawnCell, DrawnMerge, DrawnRun } from './protocol';
import { sparkline } from './sparkline';

/** One cell as a `<td>`: what it says, and the look it was sent wearing. */
export function drawCell(
  cell: DrawnCell | undefined,
  merge: DrawnMerge | undefined,
  spill = 0,
  protectedSheet = false,
): HTMLTableCellElement {
  const drawn = document.createElement('td');
  if (merge !== undefined) {
    drawn.colSpan = merge.right - merge.left + 1;
    drawn.rowSpan = merge.bottom - merge.top + 1;
  }

  // Excel locks every cell, so on a protected sheet the ones worth marking are
  // the ones a style unlocks (`docs/spec.md` §16).
  if (protectedSheet && cell?.style['protection.locked'] === false) drawn.classList.add('unlocked');

  if (cell === undefined) return drawn;

  if (cell.bar !== null) drawn.append(bar(cell.bar));

  const icon = cell.icon === null ? null : iconOf(cell.icon);
  if (icon !== null) drawn.append(icon);

  if (cell.sparkline !== null) drawn.append(sparkline(cell.sparkline));

  const hidden = cell.bar?.barOnly === true || cell.icon?.iconsOnly === true;
  const text = hidden ? '' : cell.rich === null ? shown(cell) : '';
  if (cell.rich !== null && !hidden) drawn.append(...cell.rich.map(run));
  else if (spill > 0) drawn.append(spilling(text, spill));
  else if (text !== '') drawn.append(document.createTextNode(text));

  // A value that holds a line break is drawn with it, wrapped or not: the break
  // is what the spec says, and `nowrap` would eat it (`docs/spec.md` §3).
  if (text.includes('\n')) drawn.style.setProperty('white-space', 'pre-wrap');

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

  const over = edges(cell.style);
  if (over !== null) drawn.append(over);

  return drawn;
}

/** A `data_bar` rule's bar, behind the value and as far along as the value is (`docs/spec.md` §10). */
function bar(of: DrawnBar): HTMLElement {
  const drawn = document.createElement('span');
  drawn.className = 'bar';
  drawn.style.width = `${Math.round(of.fraction * 100)}%`;
  drawn.style.background = painted(of.color);

  return drawn;
}

/** Text let past the cell's own width, over the empty cells beside it, as both spreadsheets let it. */
function spilling(text: string, width: number): HTMLElement {
  const over = document.createElement('span');
  over.className = 'spill';
  over.style.maxWidth = `${width}px`;
  over.textContent = text;

  return over;
}

/** A cell's own borders, drawn over the grid's lines rather than collapsed with them, which a 1px line loses. */
function edges(style: StyleValues): HTMLElement | null {
  const drawn = declarations(style).filter(([name]) => name.startsWith('border-'));
  if (drawn.length === 0) return null;

  const over = document.createElement('span');
  over.className = 'edges';
  for (const [name, value] of drawn) over.style.setProperty(name, value);

  return over;
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
  done: (text: string, went: Went) => void,
): void {
  const box = document.createElement('textarea');
  box.className = 'typing';
  box.rows = 1;
  box.value = seed ?? written(drawn);

  let sent = false;
  const leave = (): void => {
    // Every box in the cell: one left behind is a white rectangle over the grid.
    for (const other of cell.querySelectorAll('.typing, .choices')) other.remove();
    cell.classList.remove('editing');
  };

  box.addEventListener('input', () => grown(box));
  box.addEventListener('keydown', (event) => {
    event.stopPropagation();

    const went = leaving(event);
    if (went !== null) {
      event.preventDefault();
      sent = true;
      done(box.value, went);
      leave();
      return;
    }

    if (breaking(event)) {
      event.preventDefault();
      broken(box);
      return;
    }

    if (event.key === 'Escape') leave();
  });
  box.addEventListener('blur', () => {
    if (!sent) leave();
  });

  for (const other of cell.querySelectorAll('.typing')) other.remove();
  cell.classList.add('editing');
  cell.append(box);

  const choices = drawn?.validation?.choices ?? null;
  if (choices !== null && choices.length > 0) {
    cell.append(
      offered(cell, choices, (choice) => {
        sent = true;
        done(choice, { rows: 1, cols: 0 });
        leave();
      }),
    );
  }

  box.focus({ preventScroll: true });
  grown(box);
  if (seed === undefined) box.select();
}

/** The choices a `list:` validation offers, under the cell: fixed to the page, which the cell's clip cannot reach. */
function offered(
  cell: HTMLTableCellElement,
  choices: readonly string[],
  take: (choice: string) => void,
): HTMLElement {
  const box = document.createElement('div');
  box.className = 'choices';

  const at = cell.getBoundingClientRect();
  box.style.top = `${at.bottom}px`;
  box.style.left = `${at.left}px`;
  box.style.minWidth = `${at.width}px`;

  for (const choice of choices) {
    const one = document.createElement('button');
    one.type = 'button';
    one.className = 'offer';
    one.textContent = choice;
    // Down rather than up: the box loses focus on the way to a click, and a
    // blur takes the whole thing away before the click could land.
    one.addEventListener('mousedown', (event) => {
      event.preventDefault();
      take(choice);
    });
    box.append(one);
  }

  return box;
}

/**
 * Ask for a line or two of text in a box over the cell — a webview has no
 * dialog to ask in. Enter sends what was typed, Escape and clicking away send
 * `null`, which leaves what is there as it is.
 */
export function askInto(
  cell: HTMLTableCellElement,
  of: Asking,
  done: (text: string | null) => void,
): void {
  const box = document.createElement('textarea');
  box.className = `asking ${of.className}`;
  box.rows = of.rows;
  box.value = of.value;
  box.placeholder = of.placeholder;

  let over = false;
  const leave = (text: string | null) => {
    if (over) return;
    over = true;
    done(text);
  };

  box.addEventListener('keydown', (event) => {
    event.stopPropagation();

    if (leaving(event) !== null) {
      event.preventDefault();
      leave(box.value.trim());
      return;
    }
    if (breaking(event)) {
      event.preventDefault();
      broken(box);
      return;
    }
    if (event.key === 'Escape') leave(null);
  });
  box.addEventListener('blur', () => leave(null));

  cell.append(box);
}

/** What such a box asks for: the class that draws it, what it opens holding, and what it says while empty. */
export interface Asking {
  readonly className: string;
  readonly value: string;
  readonly rows: number;
  readonly placeholder: string;
}

/** Where the cell an edit was committed from leaves the reader, in cells from where they were. */
export interface Went {
  readonly rows: number;
  readonly cols: number;
}

/** The keys that commit an edit, and where each leaves the reader — as both spreadsheets move. */
export function leaving(event: KeyboardEvent): Went | null {
  if (event.key === 'Enter' && !breaking(event)) {
    return event.shiftKey ? { rows: -1, cols: 0 } : { rows: 1, cols: 0 };
  }
  if (event.key === 'Tab') return { rows: 0, cols: event.shiftKey ? -1 : 1 };

  return null;
}

/** The keys that put a line break *inside* a cell rather than committing it (`docs/spec.md` §3). */
export function breaking(event: KeyboardEvent): boolean {
  return event.key === 'Enter' && (event.altKey || event.metaKey || event.ctrlKey);
}

/** A line break where the cursor is, which is what those keys are for. */
function broken(box: HTMLTextAreaElement): void {
  const at = box.selectionStart;
  box.value = `${box.value.slice(0, at)}\n${box.value.slice(box.selectionEnd)}`;
  box.selectionStart = at + 1;
  box.selectionEnd = at + 1;
  grown(box);
}

/** The box as tall as what is in it, since a cell that holds three lines has to show them. */
function grown(box: HTMLTextAreaElement): void {
  box.rows = Math.min(MOST, box.value.split('\n').length);
}

/** How far a box grows before it scrolls instead, so one long value cannot take the sheet. */
const MOST = 8;

/** What the spec holds for this cell, as a reader would type it. */
export function written(cell: DrawnCell | undefined): string {
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
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ');
}

/** A cell's fill as an importer that reads no CSS takes one, or `null` where it has none (ADR-028). */
export function fillOf(style: StyleValues): string | null {
  return style.fill === undefined ? null : painted(style.fill);
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
  if (style['font.color'] !== undefined) put('color', painted(style['font.color']));
  // `background`, not `background-color`: Excel's clipboard reader takes the
  // shorthand and passes over the long form, which is what ate the fill.
  if (style.fill !== undefined) put('background', painted(style.fill));
  if (style['align.horizontal'] !== undefined) put('text-align', horizontal(style));
  if (style['align.vertical'] !== undefined) put('vertical-align', vertical(style));
  if (style['align.wrap'] === true) put('white-space', 'pre-wrap');

  for (const side of BORDER_EDGES) {
    const line = style[`border.${side}.style`];
    if (line === undefined) continue;

    const edge = style[`border.${side}.color`];
    const drawnWith = edge === undefined ? 'currentColor' : painted(edge);
    put(`border-${side}`, `${thickness(line)} solid ${drawnWith}`);
  }

  return css;
}

/** The look a run or a line of shape text wears, as CSS on the element drawing it. */
export function apply(drawn: HTMLElement, style: StyleValues): void {
  for (const [name, value] of declarations(style)) {
    if (!name.startsWith('border-')) drawn.style.setProperty(name, value);
  }
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

/** Whether a cell shows anything, which is what stops its neighbour spilling over it. */
export function shows(cell: DrawnCell | undefined): boolean {
  if (cell === undefined) return false;

  return cell.rich !== null || cell.formula !== null || cell.value !== null;
}

/** Whether a cell's text may run past its own width: Excel wraps or clips it otherwise. */
export function spills(cell: DrawnCell | undefined): boolean {
  if (cell === undefined || !shows(cell)) return false;

  const style = cell.style;
  const where = style['align.horizontal'];

  return (
    style['align.wrap'] !== true &&
    (where === undefined || where === 'left') &&
    !shown(cell).includes('\n')
  );
}
