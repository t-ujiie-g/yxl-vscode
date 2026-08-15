import type { StyleValues } from '@yxl-vscode/spec';
import { format as excel } from 'numfmt';
import type { Drawing, DrawnCell, DrawnSheet, Source } from './protocol';
import { across, down, heightOf, type Where, wanted, widthOf } from './window';

/** What the view is showing: the drawing, and the little it holds of its own. */
export interface Showing {
  readonly drawing: Drawing;
  readonly sheet: number;
  readonly selected: { readonly row: number; readonly col: number } | null;
  readonly sources: readonly Source[] | null;
  readonly reached: Reached | null;
}

/** What the cursor in the text is reaching, and what to call it. */
export interface Reached {
  readonly says: string;
  readonly cells: ReadonlySet<string>;
}

/** What the view can ask for. None of it changes anything (ADR-001). */
export interface Asks {
  readonly showSheet: (index: number) => void;
  readonly select: (row: number, col: number) => void;
  readonly reveal: (source: Source) => void;
  readonly setParam: (name: string, value: string) => void;
  readonly showWindow: (row: number, col: number) => void;
}

const EDGES = [
  ['left', 'borderLeft'],
  ['right', 'borderRight'],
  ['top', 'borderTop'],
  ['bottom', 'borderBottom'],
] as const;

/**
 * The whole view: a tab per sheet, and the grid of whichever is showing.
 *
 * Rebuilt outright whenever the host sends a new drawing, because that is what
 * a projection is (ADR-001) — there is no state here to reconcile, and the
 * spec is the only thing that changed.
 */
export function draw(into: HTMLElement, showing: Showing, asks: Asks): void {
  const { drawing } = showing;
  const was = into.querySelector('.scroller');
  const same = was?.getAttribute('data-of') === looking(showing);
  const kept: Where =
    same && was instanceof HTMLElement
      ? { top: was.scrollTop, left: was.scrollLeft }
      : { top: 0, left: 0 };
  into.replaceChildren();

  if (drawing.sheets.length === 0) {
    into.append(note('This spec has no sheets to draw.'));
    return;
  }

  if (drawing.params.length > 0) into.append(parameters(drawing, asks));
  if (drawing.sheets.length > 1) into.append(tabs(drawing, showing.sheet, asks.showSheet));

  const sheet = drawing.sheets[Math.min(showing.sheet, drawing.sheets.length - 1)];
  if (sheet !== undefined) {
    const box = scroller(sheet, showing, asks);
    into.append(box);
    // After it is in the page: an element with no layout box has nowhere to
    // scroll to, and the assignment would be dropped.
    box.scrollTop = kept.top;
    box.scrollLeft = kept.left;
  }

  if (showing.reached !== null) into.append(reaching(showing.reached));
  if (showing.sources !== null) into.append(inspector(showing, asks));
  if (drawing.diagnostics.length > 0) into.append(problems(drawing, asks));
}

/**
 * The parameters, as boxes to turn.
 *
 * One spec stands for several workbooks (`docs/spec.md` §7); this is how a
 * reader looks at the others without editing anything. Emptying a box gives the
 * parameter back to the spec's own default.
 */
function parameters(drawing: Drawing, asks: Asks): HTMLElement {
  const panel = document.createElement('details');
  panel.className = 'params';
  panel.open = drawing.params.some((param) => param.set);

  const heading = document.createElement('summary');
  const changed = drawing.params.filter((param) => param.set).length;
  heading.textContent = changed === 0 ? 'Parameters' : `Parameters (${changed} set)`;
  panel.append(heading);

  const form = document.createElement('div');
  form.className = 'boxes';

  for (const param of drawing.params) {
    const label = document.createElement('label');
    label.textContent = param.name;

    const box = document.createElement('input');
    box.type = 'text';
    box.value = param.value;
    box.size = 12;
    if (param.set) box.classList.add('set');
    box.addEventListener('change', () => asks.setParam(param.name, box.value));

    label.append(box);
    form.append(label);
  }

  panel.append(form);
  return panel;
}

/** What a scroll position is a position in, so that another sheet starts at its top. */
function looking(showing: Showing): string {
  return `${showing.drawing.file}#${showing.sheet}`;
}

/**
 * The sheet as something to scroll through: the drawn window, sitting in a box
 * padded out to the size of the whole sheet.
 *
 * The scrollbar then says how much sheet there is, while the grid holds only a
 * window's worth of cells however large the sheet is (§9 R5). Coming near an
 * edge of what is drawn asks the host for a window around where the reader now
 * is; the scroll position outlives the redraw that answers, because the padding
 * puts every row at the same offset whichever window is drawn.
 */
function scroller(sheet: DrawnSheet, showing: Showing, asks: Asks): HTMLElement {
  const box = document.createElement('div');
  box.className = 'scroller';
  box.setAttribute('data-of', looking(showing));
  box.append(grid(sheet, showing, asks));

  box.addEventListener('scroll', () => {
    const at = wanted(sheet, { top: box.scrollTop, left: box.scrollLeft });
    if (at !== null) asks.showWindow(at.row, at.col);
  });

  return box;
}

/** What the cursor is reaching, said above the grid so the highlight is explained. */
function reaching(reached: Reached): HTMLElement {
  const said = document.createElement('p');
  said.className = 'reaching';

  const count = reached.cells.size;
  said.textContent =
    count === 0
      ? `${reached.says} reaches no cell the grid holds`
      : `${reached.says} reaches ${count} cell${count === 1 ? '' : 's'}`;

  return said;
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
  const problems = markedBy(sheet);

  const before = down(sheet, sheet.at.row);
  if (before > 0) body.append(gap(sheet, before));

  for (let row = sheet.at.row; row < sheet.at.row + sheet.rows; row += 1) {
    body.append(line(sheet, row, held, covered, problems, showing, asks));
  }

  const after = down(sheet, sheet.of.rows + 1) - down(sheet, sheet.at.row + sheet.rows);
  if (after > 0) body.append(gap(sheet, after));

  table.append(body);
  return table;
}

/** The diagnostics on each cell, gathered so a cell can be asked about once. */
function markedBy(sheet: DrawnSheet): Map<string, string[]> {
  const problems = new Map<string, string[]>();

  for (const problem of sheet.problems) {
    const at = `${problem.col}:${problem.row}`;
    problems.set(at, [...(problems.get(at) ?? []), problem.message]);
  }

  return problems;
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

  const before = across(sheet, sheet.at.col);
  if (before > 0) line.append(pad(before));

  for (let col = sheet.at.col; col < sheet.at.col + sheet.columns; col += 1) {
    const heading = document.createElement('th');
    heading.textContent = label(col);
    heading.style.width = `${widthOf(sheet, col)}px`;
    line.append(heading);
  }

  const after = across(sheet, sheet.of.columns + 1) - across(sheet, sheet.at.col + sheet.columns);
  if (after > 0) line.append(pad(after));

  head.append(line);
  return head;
}

/**
 * A cell holding nothing but the width of the columns the window left out.
 *
 * A `td` even in the heading row: a `th` there would be frozen to the edge like
 * the headings it sits among, and this one has to scroll with what it stands in
 * for.
 */
function pad(width: number): HTMLElement {
  const cell = document.createElement('td');
  cell.className = 'pad';
  cell.style.width = `${width}px`;
  return cell;
}

/** The same down the page: a row holding the height of the rows left out. */
function gap(sheet: DrawnSheet, height: number): HTMLElement {
  const line = document.createElement('tr');
  line.className = 'gap';
  line.style.height = `${height}px`;

  const cell = document.createElement('td');
  cell.colSpan = sheet.columns + 3;
  line.append(cell);
  return line;
}

function line(
  sheet: DrawnSheet,
  row: number,
  held: ReadonlyMap<string, DrawnCell>,
  covered: ReadonlySet<string>,
  problems: ReadonlyMap<string, readonly string[]>,
  showing: Showing,
  asks: Asks,
): HTMLElement {
  const line = document.createElement('tr');
  line.style.height = `${heightOf(sheet, row)}px`;

  const number = document.createElement('th');
  number.textContent = String(row);
  line.append(number);

  const before = across(sheet, sheet.at.col);
  if (before > 0) line.append(pad(before));

  for (let col = sheet.at.col; col < sheet.at.col + sheet.columns; col += 1) {
    if (covered.has(`${col}:${row}`)) continue;

    const drawn = drawCell(sheet, held.get(`${col}:${row}`), col, row);
    if (showing.selected?.row === row && showing.selected.col === col) {
      drawn.classList.add('selected');
    }
    if (showing.reached?.cells.has(`${col}:${row}`) === true) drawn.classList.add('reached');

    const said = problems.get(`${col}:${row}`);
    if (said !== undefined) {
      drawn.classList.add('problem');
      drawn.title = said.join('\n');
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
 * A number wears its format, so `0.085` under `0.0%` reads `8.5%` here as it
 * will in Excel. A pattern the formatter cannot read shows its own error rather
 * than throwing the view away.
 *
 * A cell **filled** by a `formulas:` range shows where it is filled from
 * instead. The range holds one formula, written as it applies at its anchor,
 * and Excel shifts the references per cell (§8 Q2) — printing that text in
 * every cell would be printing something false in all but one of them.
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

function problems(drawing: Drawing, asks: Asks): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'problems';

  for (const problem of drawing.diagnostics) {
    const item = document.createElement('li');
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'go';
    go.textContent = problem.message;
    go.title = problem.file;
    go.addEventListener('click', () => asks.reveal({ facet: problem.code, says: '', ...problem }));

    item.append(go);
    list.append(item);
  }

  return list;
}
