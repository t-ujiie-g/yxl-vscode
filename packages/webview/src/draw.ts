import { columnLabel } from '@yxl-vscode/units';
import { corner, findBar, told } from './boxes';
import { drawCell, typeInto } from './cell';
import {
  type At,
  copying,
  going,
  looking as lookingFor,
  pasting,
  takingAll,
  undoing,
  within,
} from './keys';
import { fit } from './menus';
import {
  inspector,
  note,
  parameters,
  problems,
  reaching,
  refusal,
  tabs,
  uncomputed,
} from './panels';
import type { DrawnCell, DrawnMerge, DrawnSheet } from './protocol';
import { type Asks, cellKey, GUTTER, HEADING, type Showing } from './showing';
import { toolbar } from './toolbar';
import { across, down, heightOf, sizeOf, type Where, wanted, widthOf } from './window';

/**
 * The whole view, rebuilt outright whenever the host sends a new drawing
 * (ADR-001). What the view holds of its own goes through `restate`: a click
 * that replaced the cell it landed on could never be double-clicked.
 */
export function draw(into: HTMLElement, showing: Showing, asks: Asks): void {
  const { drawing } = showing;
  // Focus is put back only where the grid had it: taking it would take it
  // from the text editor beside.
  const held = into.contains(document.activeElement);
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

  if (showing.looking !== null) into.append(findBar(showing.looking, asks));
  if (drawing.params.length > 0) into.append(parameters(drawing, asks));
  if (drawing.sheets.length > 1) into.append(tabs(drawing, showing.sheet, asks.showSheet));
  into.append(toolbar(showing, asks));

  const sheet = drawing.sheets[Math.min(showing.sheet, drawing.sheets.length - 1)];
  if (sheet !== undefined) {
    const box = scroller(sheet, showing, asks);
    into.append(box);
    // Only once it is in the page: an element with no layout box cannot scroll.
    box.scrollTop = kept.top;
    box.scrollLeft = kept.left;
  }

  const under = document.createElement('div');
  under.className = 'under';
  into.append(under);
  say(under, showing, asks);
  fit(into);

  if (held) focusCell(into, showing);
}

/** The keyboard on the cell the reader has selected, where there is one. */
export function focusCell(into: HTMLElement, showing: Showing): void {
  if (showing.selected === null) return;

  const at = cellKey(showing.selected.col, showing.selected.row);
  into.querySelector<HTMLElement>(`td[data-at="${at}"]`)?.focus({ preventScroll: true });
}

/** What the view holds of its own, shown without rebuilding what the host sent. */
export function restate(into: HTMLElement, showing: Showing, asks: Asks): void {
  const under = into.querySelector('.under');
  const grid = into.querySelector('.grid');
  if (under === null || grid === null) {
    draw(into, showing, asks);
    return;
  }

  for (const cell of grid.querySelectorAll('td.selected')) cell.classList.remove('selected');
  for (const cell of grid.querySelectorAll('td.ranged')) cell.classList.remove('ranged');
  for (const cell of grid.querySelectorAll('td.copied')) cell.classList.remove('copied');
  for (const cell of grid.querySelectorAll('td.found')) cell.classList.remove('found');
  for (const cell of grid.querySelectorAll('td.reached')) cell.classList.remove('reached');

  const at = showing.selected;
  if (at !== null)
    grid.querySelector(`td[data-at="${cellKey(at.col, at.row)}"]`)?.classList.add('selected');

  for (const cell of grid.querySelectorAll<HTMLElement>('td[data-at]')) {
    const key = cell.getAttribute('data-at')?.split(':') ?? [];
    const col = Number(key[0]);
    const row = Number(key[1]);
    if (ranged(showing, { row, col })) cell.classList.add('ranged');
    if (copiedFrom(showing, { row, col })) cell.classList.add('copied');
    if (lookedUp(showing, { row, col })) cell.classList.add('found');
  }

  for (const key of showing.reached?.cells ?? []) {
    grid.querySelector(`td[data-at="${key}"]`)?.classList.add('reached');
  }

  // The switches say what the *selected* cell wears, so they follow the selection.
  into.querySelector('.toolbar')?.replaceWith(toolbar(showing, asks));

  say(under, showing, asks);
  told(into, showing);
  fit(into);
}

/** Everything said under the grid, which is rebuilt on its own. */
function say(under: Element, showing: Showing, asks: Asks): void {
  const { drawing } = showing;
  under.replaceChildren();

  if (showing.said !== null) under.append(note(showing.said));
  if (showing.refused !== null) under.append(refusal(showing.refused, asks));
  if (drawing.uncomputed !== null) under.append(note(uncomputed(drawing.uncomputed)));
  if (showing.reached !== null && showing.reached.says !== '') {
    under.append(reaching(showing.reached));
  }
  if (showing.sources !== null) under.append(inspector(showing, asks));
  if (drawing.diagnostics.length > 0) under.append(problems(drawing, asks));
}

/** What a scroll position is a position in, so that another sheet starts at its top. */
function looking(showing: Showing): string {
  return `${showing.drawing.file}#${showing.sheet}`;
}

/** The drawn window padded to the whole sheet's size, so the scrollbar says how much sheet there is. */
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

function grid(sheet: DrawnSheet, showing: Showing, asks: Asks): HTMLElement {
  const table = document.createElement('table');
  table.className = 'grid';
  // `table-layout: fixed` is inert without an explicit width.
  table.style.width = `${GUTTER + across(sheet, sheet.of.columns + 1)}px`;
  table.append(headings(sheet, showing, asks));

  const body = document.createElement('tbody');
  const held = new Map(sheet.cells.map((cell) => [cellKey(cell.col, cell.row), cell]));
  const merged = mergedIn(sheet);
  const problems = markedBy(sheet);

  const stays = (sheet.freeze?.row ?? 1) - 1;
  for (let row = 1; row <= stays; row += 1) {
    if (heightOf(sheet, row) === 0) continue;
    body.append(line(sheet, row, held, merged, problems, showing, asks));
  }

  const from = Math.max(sheet.at.row, stays + 1);
  const before = down(sheet, from) - down(sheet, stays + 1);
  if (before > 0) body.append(gap(sheet, before));

  for (let row = from; row < sheet.at.row + sheet.rows; row += 1) {
    if (heightOf(sheet, row) === 0) continue;
    body.append(line(sheet, row, held, merged, problems, showing, asks));
  }

  const after = down(sheet, sheet.of.rows + 1) - down(sheet, sheet.at.row + sheet.rows);
  if (after > 0) body.append(gap(sheet, after));

  table.append(body);
  return table;
}

/** The selection moved, and the focus with it; a cell outside the drawn window is asked for. */
function goTo(
  from: HTMLElement,
  sheet: DrawnSheet,
  to: { row: number; col: number },
  asks: Asks,
  extend = false,
): void {
  const at = {
    row: Math.min(Math.max(to.row, 1), sheet.of.rows),
    col: Math.min(Math.max(to.col, 1), sheet.of.columns),
  };
  if (extend) asks.reachTo(at.row, at.col);
  else asks.select(at.row, at.col);

  const grid = from.closest('.grid');
  const next = grid?.querySelector<HTMLElement>(`td[data-at="${cellKey(at.col, at.row)}"]`);
  if (next == null) {
    asks.showWindow(at.row, at.col);
    return;
  }

  next.focus({ preventScroll: true });
  next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/** Whether this cell is inside the rectangle the reader has selected. */
function ranged(showing: Showing, at: At): boolean {
  const { selected, anchor } = showing;
  if (selected === null || anchor === null) return false;
  if (selected.row === anchor.row && selected.col === anchor.col) return false;

  return within(at, selected, anchor);
}

/** Whether this cell is one of those the search turned up. */
function lookedUp(showing: Showing, at: At): boolean {
  return showing.looking?.cells.some((one) => one.row === at.row && one.col === at.col) === true;
}

/** Whether this cell is one of those the reader has copied, on the sheet they copied from. */
function copiedFrom(showing: Showing, at: At): boolean {
  const { copied } = showing;
  if (copied === null || copied.sheet !== showing.drawing.sheets[showing.sheet]?.name) return false;

  return (
    at.row >= copied.rect.top &&
    at.row <= copied.rect.bottom &&
    at.col >= copied.rect.left &&
    at.col <= copied.rect.right
  );
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

/** Each merge at its top-left cell, and every address it swallows, which must not be drawn. */
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

function headings(sheet: DrawnSheet, showing: Showing, asks: Asks): HTMLElement {
  const head = document.createElement('thead');
  const line = document.createElement('tr');
  line.style.height = `${HEADING}px`;
  line.append(corner(showing, asks));

  for (const one of columnsOf(sheet)) {
    if ('pad' in one) {
      if (one.pad > 0) line.append(pad(one.pad));
      continue;
    }

    const wide = widthOf(sheet, one.at);
    if (wide === 0) continue;

    const heading = document.createElement('th');
    heading.textContent = columnLabel(one.at);
    heading.style.width = `${wide}px`;
    if (one.stays) stay(sheet, heading, { col: one.at });
    heading.append(grip('column', one.at, wide, asks));
    line.append(heading);
  }

  head.append(line);
  return head;
}

/** One place along a line: a column to draw, or the width of those the window left out. */
type Along = { readonly at: number; readonly stays: boolean } | { readonly pad: number };

/** What a line is drawn from across: the frozen columns, then the window's own, the rest as width. */
function columnsOf(sheet: DrawnSheet): Along[] {
  const stays = (sheet.freeze?.col ?? 1) - 1;
  const along: Along[] = [];
  for (let col = 1; col <= stays; col += 1) along.push({ at: col, stays: true });

  const from = Math.max(sheet.at.col, stays + 1);
  along.push({ pad: across(sheet, from) - across(sheet, stays + 1) });
  for (let col = from; col < sheet.at.col + sheet.columns; col += 1) {
    along.push({ at: col, stays: false });
  }

  along.push({
    pad: across(sheet, sheet.of.columns + 1) - across(sheet, sheet.at.col + sheet.columns),
  });
  return along;
}

/** A cell of a frozen band, put where it stays: under the headings, or right of the row numbers. */
function stay(sheet: DrawnSheet, cell: HTMLElement, at: { row?: number; col?: number }): void {
  if (at.row !== undefined) cell.style.top = `${HEADING + down(sheet, at.row)}px`;
  if (at.col === undefined) return;

  cell.classList.add('stays');
  cell.style.left = `${GUTTER + across(sheet, at.col)}px`;
}

/** The edge of a heading, dragged to size what it heads; sent once on the way up, since every step would be an edit. */
function grip(axis: 'column' | 'row', at: number, from: number, asks: Asks): HTMLElement {
  const held = document.createElement('span');
  held.className = `grip ${axis}`;

  held.addEventListener('mousedown', (down: MouseEvent) => {
    down.preventDefault();
    down.stopPropagation();

    const heading = held.parentElement;
    const start = axis === 'column' ? down.clientX : down.clientY;
    let size = from;

    const moved = (at: MouseEvent) => {
      size = Math.max(1, from + (axis === 'column' ? at.clientX : at.clientY) - start);
      if (heading === null) return;
      if (axis === 'column') heading.style.width = `${size}px`;
      else heading.style.height = `${size}px`;
    };

    const up = () => {
      document.removeEventListener('mousemove', moved);
      document.removeEventListener('mouseup', up);
      if (size !== from) asks.resize(axis, at, sizeOf(axis, size));
    };

    document.addEventListener('mousemove', moved);
    document.addEventListener('mouseup', up);
  });

  return held;
}

/** The width of the columns the window left out; a `td` even among headings, since it must scroll. */
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
  number.append(grip('row', row, heightOf(sheet, row), asks));
  line.append(number);

  for (const one of columnsOf(sheet)) {
    if ('pad' in one) {
      if (one.pad > 0) line.append(pad(one.pad));
      continue;
    }

    const col = one.at;
    if (merged.covered.has(cellKey(col, row)) || widthOf(sheet, col) === 0) continue;

    const drawn = drawCell(held.get(cellKey(col, row)), merged.anchored.get(cellKey(col, row)));
    drawn.setAttribute('data-at', cellKey(col, row));
    if (one.stays) stay(sheet, drawn, { col });
    if (showing.selected?.row === row && showing.selected.col === col) {
      drawn.classList.add('selected');
    }
    if (ranged(showing, { row, col })) drawn.classList.add('ranged');
    if (copiedFrom(showing, { row, col })) drawn.classList.add('copied');
    if (lookedUp(showing, { row, col })) drawn.classList.add('found');
    if (showing.reached?.cells.has(cellKey(col, row)) === true) drawn.classList.add('reached');

    const said = problems.get(cellKey(col, row));
    if (said !== undefined) {
      drawn.classList.add('problem');
      drawn.title = said.join('\n');
    }
    const type = (seed?: string): void => {
      if (drawn.querySelector('.typing') !== null) return;

      typeInto(drawn, held.get(cellKey(col, row)), seed, (text) => {
        asks.edit(row, col, text);
        goTo(drawn, sheet, { row: row + 1, col }, asks);
      });
    };

    // Focusable, so keys reach it; not tab-reachable, or the page cannot be left.
    drawn.tabIndex = -1;
    drawn.addEventListener('mousedown', (event) => {
      if (event.shiftKey) asks.reachTo(row, col);
      else asks.select(row, col);
    });
    drawn.addEventListener('mouseenter', (event) => {
      if ((event.buttons & 1) === 1) asks.reachTo(row, col);
    });
    drawn.addEventListener('dblclick', () => type());
    drawn.addEventListener('keydown', (event) => {
      // The edit box is a child of the cell, so its keys bubble here.
      if (event.target !== drawn) return;

      if (undoing(event)) {
        event.preventDefault();
        asks.undo(event.shiftKey);
        return;
      }

      const through = lookingFor(event);
      if (through !== null) {
        event.preventDefault();
        if (through === 'open') asks.look(showing.looking?.text ?? '');
        else asks.goOn(through === 'on' ? 1 : -1);
        return;
      }

      const taking = copying(event);
      if (taking !== null) {
        event.preventDefault();
        asks.copy(row, col, taking === 'cut');
        return;
      }

      // Not taken over: the clipboard only arrives in the `paste` event this
      // key sets off, and the view decides there which paste this is.
      if (pasting(event)) {
        asks.paste(row, col);
        return;
      }

      if (takingAll(event)) {
        event.preventDefault();
        asks.select(1, 1);
        asks.reachTo(sheet.of.rows, sheet.of.columns);
        return;
      }

      const move = going(event, sheet, held, { row, col });
      if (move !== null) {
        event.preventDefault();
        goTo(drawn, sheet, move.to, asks, move.extend);
        return;
      }

      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        type();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        asks.empty(row, col);
        return;
      }

      if (typed(event)) {
        event.preventDefault();
        type(event.key);
      }
    });
    line.append(drawn);
  }

  if (row < (sheet.freeze?.row ?? 1)) {
    line.classList.add('frozen');
    for (const cell of line.children) {
      if (cell instanceof HTMLElement) stay(sheet, cell, { row });
    }
  }

  return line;
}
