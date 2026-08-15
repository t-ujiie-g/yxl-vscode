import { columnLabel } from '@yxl-vscode/units';
import { drawCell, typeInto } from './cell';
import type { Drawing, DrawnCell, DrawnMerge, DrawnSheet, Source, Uncomputed } from './protocol';
import { across, down, heightOf, type Where, wanted, widthOf } from './window';

/** What the view is showing: the drawing, and the little it holds of its own. */
export interface Showing {
  readonly drawing: Drawing;
  readonly sheet: number;
  readonly selected: { readonly row: number; readonly col: number } | null;
  readonly sources: readonly Source[] | null;
  readonly reached: Reached | null;
  readonly refused: string | null;
}

/** What the cursor in the text is reaching, and what to call it. */
export interface Reached {
  readonly says: string;
  readonly cells: ReadonlySet<string>;
}

/** How a cell is named in the sets and maps a drawing is looked up in. */
export function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

/** What the view can ask for. None of it changes anything (ADR-001). */
export interface Asks {
  readonly showSheet: (index: number) => void;
  readonly select: (row: number, col: number) => void;
  readonly reveal: (source: Source) => void;
  readonly setParam: (name: string, value: string) => void;
  readonly showWindow: (row: number, col: number) => void;
  readonly edit: (row: number, col: number, text: string) => void;
}

/**
 * The whole view: a tab per sheet, and the grid of whichever is showing.
 *
 * Rebuilt outright whenever the host sends a new drawing, because that is what
 * a projection is (ADR-001) — there is no state here to reconcile, and the
 * spec is the only thing that changed.
 *
 * What the *view* holds of its own — which cell is selected, what the cursor
 * reaches, the answer to the last question — is not that, and rebuilding the
 * grid for it would be both wasteful and wrong: a click that replaces the cell
 * it landed on is a cell that can never be double-clicked. `restate` is the
 * entry point for those.
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

  const under = document.createElement('div');
  under.className = 'under';
  into.append(under);
  say(under, showing, asks);
}

/**
 * What the view holds of its own, shown without rebuilding what the host sent.
 *
 * Selection, the cursor's highlight, and the inspector all change many times
 * per drawing; the grid changes when the spec does. Keeping them apart is what
 * makes the grid something a reader can click twice on.
 */
export function restate(into: HTMLElement, showing: Showing, asks: Asks): void {
  const under = into.querySelector('.under');
  const grid = into.querySelector('.grid');
  if (under === null || grid === null) {
    draw(into, showing, asks);
    return;
  }

  for (const cell of grid.querySelectorAll('td.selected')) cell.classList.remove('selected');
  for (const cell of grid.querySelectorAll('td.reached')) cell.classList.remove('reached');

  const at = showing.selected;
  if (at !== null)
    grid.querySelector(`td[data-at="${cellKey(at.col, at.row)}"]`)?.classList.add('selected');

  for (const key of showing.reached?.cells ?? []) {
    grid.querySelector(`td[data-at="${key}"]`)?.classList.add('reached');
  }

  say(under, showing, asks);
}

/** Everything said under the grid, which is rebuilt on its own. */
function say(under: Element, showing: Showing, asks: Asks): void {
  const { drawing } = showing;
  under.replaceChildren();

  if (showing.refused !== null) under.append(refusal(showing.refused));
  if (drawing.uncomputed !== null) under.append(note(uncomputed(drawing.uncomputed)));
  if (showing.reached !== null) under.append(reaching(showing.reached));
  if (showing.sources !== null) under.append(inspector(showing, asks));
  if (drawing.diagnostics.length > 0) under.append(problems(drawing, asks));
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
 * window's worth of cells however large the sheet is. Coming near an
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

/**
 * Why some cells show a formula rather than what it comes to.
 *
 * Said once, under the grid, rather than on every cell: a reader who sees one
 * formula among numbers is owed the reason, and the reason is the same for all
 * of them.
 */
function uncomputed(said: Uncomputed): string {
  if (said.kind === 'tooMany') {
    return `Nothing is computed here: this workbook holds more than ${said.limit} formulas, and computing some of them would make every total over the rest wrong.`;
  }

  const shown = said.names.slice(0, 3).join(', ');
  const rest = said.names.length > 3 ? `, and ${said.names.length - 3} more` : '';

  return `Not computed here: ${shown}${rest} — this preview does not model tables or workbook-defined names, so formulas that use them show as formulas.`;
}

/** Why an edit did not happen, said where the edit was attempted. */
function refusal(why: string): HTMLElement {
  const said = document.createElement('p');
  said.className = 'refused';
  said.textContent = why;
  return said;
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
 * Where each facet of the selected cell came from.
 *
 * Every line is a place in a file, so every line can be gone to — which is half
 * of the bidirectional jump this release is for.
 */
function inspector(showing: Showing, asks: Asks): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'inspector';

  const at = showing.selected;
  const heading = document.createElement('h2');
  heading.textContent = at === null ? 'Nothing selected' : `${columnLabel(at.col)}${at.row}`;
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
  // A table laid out `fixed` only *is* laid out fixed if it has a width of its
  // own; left to size itself it reverts to the automatic algorithm, where one
  // cell holding a long formula stretches its column and drags the sheet out of
  // shape. The width is the sheet's own: the gutter, plus every column of it.
  table.style.width = `${GUTTER + across(sheet, sheet.of.columns + 1)}px`;
  table.append(headings(sheet));

  const body = document.createElement('tbody');
  const held = new Map(sheet.cells.map((cell) => [cellKey(cell.col, cell.row), cell]));
  const merged = mergedIn(sheet);
  const problems = markedBy(sheet);

  const before = down(sheet, sheet.at.row);
  if (before > 0) body.append(gap(sheet, before));

  for (let row = sheet.at.row; row < sheet.at.row + sheet.rows; row += 1) {
    if (heightOf(sheet, row) === 0) continue;
    body.append(line(sheet, row, held, merged, problems, showing, asks));
  }

  const after = down(sheet, sheet.of.rows + 1) - down(sheet, sheet.at.row + sheet.rows);
  if (after > 0) body.append(gap(sheet, after));

  table.append(body);
  return table;
}

/** A key that is a character the reader meant to put in the cell. */
function typed(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/** The diagnostics on each cell, gathered so a cell can be asked about once. */
function markedBy(sheet: DrawnSheet): Map<string, string[]> {
  const problems = new Map<string, string[]>();

  for (const problem of sheet.problems) {
    const at = cellKey(problem.col, problem.row);
    problems.set(at, [...(problems.get(at) ?? []), problem.message]);
  }

  return problems;
}

/**
 * Each merge at its top-left cell, and every address it swallows.
 *
 * Excel shows the top-left cell's value across the whole region, so the rest of
 * it must not be drawn at all — a `<td>` there would push the row along.
 */
function mergedIn(sheet: DrawnSheet): Merged {
  const anchored = new Map<string, DrawnMerge>();
  const covered = new Set<string>();

  for (const merge of sheet.merges) {
    anchored.set(cellKey(merge.left, merge.top), merge);
    for (let row = merge.top; row <= merge.bottom; row += 1) {
      for (let col = merge.left; col <= merge.right; col += 1) {
        if (row !== merge.top || col !== merge.left) covered.add(cellKey(col, row));
      }
    }
  }

  return { anchored, covered };
}

interface Merged {
  readonly anchored: ReadonlyMap<string, DrawnMerge>;
  readonly covered: ReadonlySet<string>;
}

function headings(sheet: DrawnSheet): HTMLElement {
  const head = document.createElement('thead');
  const line = document.createElement('tr');
  line.append(corner());

  const before = across(sheet, sheet.at.col);
  if (before > 0) line.append(pad(before));

  for (let col = sheet.at.col; col < sheet.at.col + sheet.columns; col += 1) {
    const wide = widthOf(sheet, col);
    if (wide === 0) continue;

    const heading = document.createElement('th');
    heading.textContent = columnLabel(col);
    heading.style.width = `${wide}px`;
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
  merged: Merged,
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
    if (merged.covered.has(cellKey(col, row)) || widthOf(sheet, col) === 0) continue;

    const drawn = drawCell(held.get(cellKey(col, row)), merged.anchored.get(cellKey(col, row)));
    drawn.setAttribute('data-at', cellKey(col, row));
    if (showing.selected?.row === row && showing.selected.col === col) {
      drawn.classList.add('selected');
    }
    if (showing.reached?.cells.has(cellKey(col, row)) === true) drawn.classList.add('reached');

    const said = problems.get(cellKey(col, row));
    if (said !== undefined) {
      drawn.classList.add('problem');
      drawn.title = said.join('\n');
    }
    const type = (seed?: string): void => {
      // The box lives *inside* the cell, so a second one would be a second box
      // in the same cell rather than a replacement.
      if (drawn.querySelector('.typing') !== null) return;

      typeInto(drawn, held.get(cellKey(col, row)), seed, (text) => {
        asks.edit(row, col, text);
        asks.select(row + 1, col);
      });
    };

    // Focusable so the keys that start an edit reach the cell, and not
    // tab-reachable, because a grid of ten thousand tab stops is a page nobody
    // can leave.
    drawn.tabIndex = -1;
    drawn.addEventListener('click', () => asks.select(row, col));
    drawn.addEventListener('dblclick', () => type());
    drawn.addEventListener('keydown', (event) => {
      // Typing *in* the box is not typing *at* the cell, and the box is a child
      // of the cell — so its keys arrive here too unless this says otherwise.
      if (event.target !== drawn) return;

      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        type();
        return;
      }

      // Typing over a cell replaces it, and the first character typed is part
      // of what was typed — the same as a spreadsheet, where nobody presses
      // anything first.
      if (typed(event)) {
        event.preventDefault();
        type(event.key);
      }
    });
    line.append(drawn);
  }

  return line;
}

function corner(): HTMLElement {
  const cell = document.createElement('th');
  cell.className = 'corner';
  cell.style.width = `${GUTTER}px`;
  return cell;
}

/** How wide the column of row numbers is, which is not a column of the sheet. */
const GUTTER = 44;

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
