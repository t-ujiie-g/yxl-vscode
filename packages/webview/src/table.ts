import type { Axis } from '@yxl-vscode/spec';
import { columnLabel } from '@yxl-vscode/units';
import { corner } from './boxes';
import { drawCell, typeInto } from './cell';
import { copying, going, looking as lookingFor, pasting, undoing } from './keys';
import {
  behind,
  drawOutline,
  groupOver,
  groupsOf,
  gutterOf,
  held,
  hidden,
  levelsOf,
  opening,
  outline,
  type Span,
} from './outline';
import type { DrawnCell, DrawnMerge, DrawnSheet } from './protocol';
import {
  type Asks,
  cellKey,
  copiedFrom,
  GUTTER,
  HEADING,
  lookedUp,
  OUTLINE,
  ranged,
  type Showing,
} from './showing';
import { across, down, heightOf, sizeOf, widthOf } from './window';

/** The sheet as one `<table>`: the headings, the rows drawn of it, and the bands that stay put. */
export function grid(sheet: DrawnSheet, showing: Showing, asks: Asks): HTMLElement {
  const table = document.createElement('table');
  table.className = 'grid';
  // `table-layout: fixed` is inert without an explicit width.
  table.style.width = `${gutterOf(sheet, 'row') + GUTTER + across(sheet, sheet.of.columns + 1)}px`;
  table.append(headings(sheet, showing, asks));

  const body = document.createElement('tbody');
  const held = new Map(sheet.cells.map((cell) => [cellKey(cell.col, cell.row), cell]));
  const merged = mergedIn(sheet);
  const problems = markedBy(sheet);

  const stays = (sheet.freeze?.row ?? 1) - 1;
  let drawn: number | null = null;
  for (let row = 1; row <= stays; row += 1) {
    if (heightOf(sheet, row) === 0) continue;
    body.append(line(sheet, row, held, merged, problems, showing, asks, behind(drawn, row)));
    drawn = row;
  }

  const from = Math.max(sheet.at.row, stays + 1);
  const before = down(sheet, from) - down(sheet, stays + 1);
  if (before > 0) body.append(gap(sheet, before));
  if (before > 0) drawn = null;

  for (let row = from; row < sheet.at.row + sheet.rows; row += 1) {
    if (heightOf(sheet, row) === 0) continue;
    body.append(line(sheet, row, held, merged, problems, showing, asks, behind(drawn, row)));
    drawn = row;
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
  for (let level = 1; level <= levelsOf(sheet, 'column'); level += 1) {
    head.append(above(sheet, level, asks));
  }

  const line = document.createElement('tr');
  line.style.height = `${HEADING}px`;
  line.append(...outline(sheet, null, asks), corner(asks, gutterOf(sheet, 'row')));

  let drawn: number | null = null;
  for (const one of columnsOf(sheet)) {
    if ('pad' in one) {
      // Only a pad with width to it breaks the run: the empty one between the
      // frozen band and the window has nothing between its two sides.
      if (one.pad > 0) {
        line.append(pad(one.pad));
        drawn = null;
      }
      continue;
    }

    const wide = widthOf(sheet, one.at);
    if (wide === 0) continue;

    const heading = document.createElement('th');
    heading.textContent = columnLabel(one.at);
    heading.style.width = `${wide}px`;
    if (one.stays) stay(sheet, heading, { col: one.at });
    takes(heading, 'column', one.at, showing, asks);

    const run = behind(drawn, one.at);
    const over = run === null ? null : groupOver(sheet, 'column', run);
    if (over === null && run !== null) hidden(heading, 'column', run, asks);

    heading.append(grip('column', one.at, wide, asks));
    line.append(heading);
    drawn = one.at;
  }

  head.append(line);
  return head;
}

/** One level of the column outline: a row above the headings, aligned with them (ADR-045). */
export function above(sheet: DrawnSheet, level: number, asks: Asks): HTMLElement {
  const line = document.createElement('tr');
  line.className = 'outline column';
  line.style.height = `${OUTLINE}px`;

  const blank = document.createElement('th');
  blank.className = 'corner';
  blank.style.width = `${GUTTER}px`;
  blank.style.left = `${gutterOf(sheet, 'row')}px`;
  line.append(...outline(sheet, null, asks), blank);

  const runs = groupsOf(sheet, 'column').filter((run) => run.group === level);
  let drawn: number | null = null;

  for (const one of columnsOf(sheet)) {
    if ('pad' in one) {
      if (one.pad > 0) {
        line.append(pad(one.pad));
        drawn = null;
      }
      continue;
    }
    if (widthOf(sheet, one.at) === 0) continue;

    const cell = document.createElement('td');
    cell.className = 'outline column';

    const run = runs.find((each) => held(each, one.at));
    if (run !== undefined) drawOutline(cell, 'column', run, one.at, asks);

    const gone = behind(drawn, one.at);
    const over = gone === null ? null : groupOver(sheet, 'column', gone);
    if (over !== null && over.group === level) opening(cell, 'column', over, asks);

    line.append(cell);
    drawn = one.at;
  }

  return line;
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

/** A heading that takes its whole row or column, and reaches across the ones dragged over. */
function takes(heading: HTMLElement, axis: Axis, at: number, showing: Showing, asks: Asks): void {
  heading.setAttribute(axis === 'column' ? 'data-col' : 'data-row', String(at));
  if (headed(showing, axis, at)) heading.classList.add('selected');

  heading.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    asks.pointAt({ kind: 'heading', axis, at, x: event.clientX, y: event.clientY });
  });

  // Focusable so the page's keys reach it, as a cell is; not tab-reachable.
  heading.tabIndex = -1;
  heading.addEventListener('mousedown', (event) => {
    // Not the grip, which sizes; not the right button, which is about to open a
    // menu about a run this would throw away.
    if (event.target !== heading || event.button !== 0) return;

    // Taken, or the browser puts the keyboard on the page and the shortcuts
    // above the grid stop reaching it.
    event.preventDefault();
    heading.focus({ preventScroll: true });
    asks.takeBand(axis, at, event.shiftKey);
  });
  heading.addEventListener('mouseenter', (event) => {
    if ((event.buttons & 1) === 1) asks.takeBand(axis, at, true);
  });
}

/** Whether the selection reaches this row or column, which is what lights its heading. */
export function headed(showing: Showing, axis: Axis, at: number): boolean {
  const { selected, anchor } = showing;
  if (selected === null) return false;

  const other = anchor ?? selected;
  const one = axis === 'column' ? selected.col : selected.row;
  const than = axis === 'column' ? other.col : other.row;

  return at >= Math.min(one, than) && at <= Math.max(one, than);
}

/** A cell of a frozen band, put where it stays: under the headings, or right of the row numbers. */
function stay(sheet: DrawnSheet, cell: HTMLElement, at: { row?: number; col?: number }): void {
  if (at.row !== undefined) {
    cell.style.top = `${gutterOf(sheet, 'column') + HEADING + down(sheet, at.row)}px`;
  }
  if (at.col === undefined) return;

  cell.classList.add('stays');
  cell.style.left = `${gutterOf(sheet, 'row') + GUTTER + across(sheet, at.col)}px`;
}

/** The edge of a heading, dragged to size what it heads; sent once on the way up, since every step would be an edit. */
function grip(axis: Axis, at: number, from: number, asks: Asks): HTMLElement {
  const held = document.createElement('span');
  held.className = `grip ${axis}`;

  held.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopPropagation();
    asks.fit(axis, at);
  });

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
  cell.colSpan = sheet.columns + 3 + levelsOf(sheet, 'row');
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
  behind: Span | null = null,
): HTMLElement {
  const line = document.createElement('tr');
  line.style.height = `${heightOf(sheet, row)}px`;

  const over = behind === null ? null : groupOver(sheet, 'row', behind);
  line.append(...outline(sheet, row, asks, behind));

  const number = document.createElement('th');
  number.textContent = String(row);
  number.style.left = `${gutterOf(sheet, 'row')}px`;
  takes(number, 'row', row, showing, asks);
  if (over === null && behind !== null) hidden(number, 'row', behind, asks);
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

      typeInto(drawn, held.get(cellKey(col, row)), seed, (text, went) => {
        asks.edit(row, col, text);
        goTo(drawn, sheet, { row: row + went.rows, col: col + went.cols }, asks);
      });
    };

    // Focusable, so keys reach it; not tab-reachable, or the page cannot be left.
    drawn.tabIndex = -1;
    drawn.addEventListener('mousedown', (event) => {
      // Not the right button, which fires this before the menu it is opening
      // and would throw away the selection that menu is about.
      if (event.button !== 0) return;

      if (event.shiftKey) asks.reachTo(row, col);
      else asks.select(row, col);
    });
    drawn.addEventListener('mouseenter', (event) => {
      if ((event.buttons & 1) === 1) asks.reachTo(row, col);
    });
    drawn.addEventListener('dblclick', () => type());
    drawn.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      asks.pointAt({ kind: 'cell', row, col, x: event.clientX, y: event.clientY });
    });
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
        if (through === 'open') asks.look(null);
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
