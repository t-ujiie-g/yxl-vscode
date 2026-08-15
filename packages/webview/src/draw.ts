import type { StyleValues } from '@yxl-vscode/spec';
import type { Drawing, DrawnCell, DrawnSheet, Source } from './protocol';

/** What the view is showing: the drawing, and the little it holds of its own. */
export interface Showing {
  readonly drawing: Drawing;
  readonly sheet: number;
  readonly selected: { readonly row: number; readonly col: number } | null;
  readonly sources: readonly Source[] | null;
}

/** What the view can ask for. None of it changes anything (ADR-001). */
export interface Asks {
  readonly showSheet: (index: number) => void;
  readonly select: (row: number, col: number) => void;
  readonly reveal: (source: Source) => void;
}

const EDGES = [
  ['left', 'borderLeft'],
  ['right', 'borderRight'],
  ['top', 'borderTop'],
  ['bottom', 'borderBottom'],
] as const;

/** Excel's own units, as CSS: a character width is about 7px, a point is 4/3 of one. */
const PER_CHARACTER = 7;
const PER_POINT = 4 / 3;

/**
 * The whole view: a tab per sheet, and the grid of whichever is showing.
 *
 * Rebuilt outright whenever the host sends a new drawing, because that is what
 * a projection is (ADR-001) — there is no state here to reconcile, and the
 * spec is the only thing that changed.
 */
export function draw(into: HTMLElement, showing: Showing, asks: Asks): void {
  const { drawing } = showing;
  into.replaceChildren();

  if (drawing.sheets.length === 0) {
    into.append(note('This spec has no sheets to draw.'));
    return;
  }

  if (drawing.sheets.length > 1) into.append(tabs(drawing, showing.sheet, asks.showSheet));

  const sheet = drawing.sheets[Math.min(showing.sheet, drawing.sheets.length - 1)];
  if (sheet !== undefined) into.append(grid(sheet, showing, asks));

  if (showing.sources !== null) into.append(inspector(showing, asks));
  if (drawing.diagnostics.length > 0) into.append(problems(drawing));
}

/**
 * Where each facet of the selected cell came from (§4.3).
 *
 * Every line is a place in a file, so every line can be gone to — which is half
 * of the bidirectional jump this release is for.
 */
function inspector(showing: Showing, asks: Asks): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'inspector';

  const at = showing.selected;
  const heading = document.createElement('h2');
  heading.textContent = at === null ? 'Nothing selected' : `${label(at.col)}${at.row}`;
  panel.append(heading);

  if (showing.sources?.length === 0) {
    panel.append(note('Nothing writes this cell.'));
    return panel;
  }

  const list = document.createElement('dl');
  for (const source of showing.sources ?? []) {
    const facet = document.createElement('dt');
    facet.textContent = source.facet;

    const says = document.createElement('dd');
    if (source.file === '') {
      says.textContent = source.says;
    } else {
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'go';
      go.textContent = source.says;
      go.title = source.file;
      go.addEventListener('click', () => asks.reveal(source));
      says.append(go);
    }

    list.append(facet, says);
  }

  panel.append(list);
  return panel;
}

function tabs(drawing: Drawing, showing: number, onShow: (index: number) => void): HTMLElement {
  const bar = document.createElement('nav');
  bar.className = 'tabs';

  for (const [index, sheet] of drawing.sheets.entries()) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.textContent = sheet.name;
    tab.className = index === showing ? 'tab showing' : 'tab';
    tab.addEventListener('click', () => onShow(index));
    bar.append(tab);
  }

  return bar;
}

function grid(sheet: DrawnSheet, showing: Showing, asks: Asks): HTMLElement {
  const table = document.createElement('table');
  table.className = 'grid';
  table.append(headings(sheet));

  const body = document.createElement('tbody');
  const held = new Map(sheet.cells.map((cell) => [`${cell.col}:${cell.row}`, cell]));
  const covered = coveredBy(sheet);

  for (let row = 1; row <= sheet.rows; row += 1) {
    body.append(line(sheet, row, held, covered, showing, asks));
  }

  table.append(body);
  return table;
}

/**
 * The addresses a merge swallows.
 *
 * Excel shows the top-left cell's value across the whole region, so the rest of
 * it must not be drawn at all — a `<td>` there would push the row along.
 */
function coveredBy(sheet: DrawnSheet): Set<string> {
  const covered = new Set<string>();

  for (const merge of sheet.merges) {
    for (let row = merge.top; row <= merge.bottom; row += 1) {
      for (let col = merge.left; col <= merge.right; col += 1) {
        if (row !== merge.top || col !== merge.left) covered.add(`${col}:${row}`);
      }
    }
  }

  return covered;
}

function headings(sheet: DrawnSheet): HTMLElement {
  const head = document.createElement('thead');
  const line = document.createElement('tr');
  line.append(corner());

  for (let col = 1; col <= sheet.columns; col += 1) {
    const heading = document.createElement('th');
    heading.textContent = label(col);
    heading.style.width = `${width(sheet, col)}px`;
    line.append(heading);
  }

  head.append(line);
  return head;
}

function line(
  sheet: DrawnSheet,
  row: number,
  held: ReadonlyMap<string, DrawnCell>,
  covered: ReadonlySet<string>,
  showing: Showing,
  asks: Asks,
): HTMLElement {
  const line = document.createElement('tr');
  const height = sized(sheet.heights, row);
  if (height !== null) line.style.height = `${height * PER_POINT}px`;

  const number = document.createElement('th');
  number.textContent = String(row);
  line.append(number);

  for (let col = 1; col <= sheet.columns; col += 1) {
    if (covered.has(`${col}:${row}`)) continue;

    const drawn = drawCell(sheet, held.get(`${col}:${row}`), col, row);
    if (showing.selected?.row === row && showing.selected.col === col) {
      drawn.classList.add('selected');
    }
    drawn.addEventListener('click', () => asks.select(row, col));
    line.append(drawn);
  }

  return line;
}

function drawCell(
  sheet: DrawnSheet,
  cell: DrawnCell | undefined,
  col: number,
  row: number,
): HTMLElement {
  const drawn = document.createElement('td');
  const merge = sheet.merges.find((one) => one.top === row && one.left === col);
  if (merge !== undefined) {
    drawn.colSpan = merge.right - merge.left + 1;
    drawn.rowSpan = merge.bottom - merge.top + 1;
  }

  if (cell === undefined) return drawn;

  drawn.textContent = shown(cell);
  if (cell.formula !== null) drawn.title = told(cell);
  if (cell.filledFrom !== null) drawn.classList.add('filled');
  apply(drawn, cell.style);
  return drawn;
}

/**
 * What a cell shows.
 *
 * A formula shows as its own text, not as a result: nothing here computes, and
 * a preview that guessed at one would be inventing a number Excel had not
 * agreed to (ADR-014). A cached value beside it is what Excel would show, so it
 * wins.
 *
 * A cell **filled** by a `formulas:` range shows where it is filled from
 * instead. The range holds one formula, written as it applies at its anchor,
 * and Excel shifts the references per cell (§8 Q2) — printing that text in
 * every cell would be printing something false in all but one of them.
 */
function shown(cell: DrawnCell): string {
  if (cell.value !== null) return String(cell.value);
  if (cell.formula === null) return '';

  return cell.filledFrom === null ? `=${cell.formula}` : `↧ ${cell.filledFrom}`;
}

/**
 * What the cell says about its own formula on hover.
 *
 * A cell of a filled range holds the formula as it applies at the range's
 * anchor; Excel shifts the relative references per cell and nothing here does
 * (§8 Q2), so the view says where it is reading from rather than letting the
 * text be read as this cell's own.
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

function width(sheet: DrawnSheet, col: number): number {
  const set = sized(sheet.widths, col);
  return (set ?? 8.43) * PER_CHARACTER;
}

function sized(runs: readonly { first: number; last: number; size: number }[], at: number) {
  const found = runs.findLast((run) => at >= run.first && at <= run.last);
  return found?.size ?? null;
}

/** A column's Excel name: 1 is `A`, 27 is `AA`. */
function label(col: number): string {
  let name = '';
  for (let left = col; left > 0; left = Math.floor((left - 1) / 26)) {
    name = String.fromCharCode(65 + ((left - 1) % 26)) + name;
  }
  return name;
}

function corner(): HTMLElement {
  const cell = document.createElement('th');
  cell.className = 'corner';
  return cell;
}

function note(text: string): HTMLElement {
  const said = document.createElement('p');
  said.className = 'note';
  said.textContent = text;
  return said;
}

function problems(drawing: Drawing): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'problems';

  for (const problem of drawing.diagnostics) {
    const item = document.createElement('li');
    item.textContent = `${problem.file}: ${problem.message}`;
    list.append(item);
  }

  return list;
}
