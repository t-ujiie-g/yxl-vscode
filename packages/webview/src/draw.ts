import { findBar, formulaBar, told } from './boxes';
import { floats } from './float';
import { takingAll, wearing } from './keys';
import { fit } from './menus';
import { gutterOf } from './outline';
import {
  comesTo,
  inspector,
  note,
  parameters,
  problems,
  reaching,
  refusal,
  tabs,
  uncomputed,
} from './panels';
import { pointing } from './pointing';
import type { DrawnSheet } from './protocol';
import {
  type Asks,
  cellKey,
  copiedFrom,
  GUTTER,
  HEADING,
  lookedUp,
  ranged,
  type Showing,
} from './showing';
import { grid, headed, pinned } from './table';
import { toolbar } from './toolbar';
import { across, down, pixelsOf, type Where, wanted } from './window';

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
  into.append(tabs(showing, asks));
  into.append(toolbar(showing, asks));
  into.append(formulaBar(showing, asks));

  const sheet = drawing.sheets[Math.min(showing.sheet, drawing.sheets.length - 1)];
  if (sheet !== undefined) {
    const box = scroller(sheet, showing, asks);
    into.append(box);
    // Only once it is in the page: an element with no layout box cannot scroll,
    // and a frozen row has no measured height until it is laid out.
    box.scrollTop = kept.top;
    box.scrollLeft = kept.left;
    pinned(box);
  }

  const menu = pointing(showing, asks);
  if (menu !== null) into.append(menu);

  const under = document.createElement('div');
  under.className = 'under';
  into.append(under);
  say(under, showing, asks);
  fit(into);
  into.addEventListener('keydown', (event) => keyed(into, event, asks));

  const box = into.querySelector<HTMLInputElement>('.tab.naming');
  const writing = into.querySelector<HTMLTextAreaElement>('.asking');
  if (box !== null) {
    // Only once it is in the page: an element outside it cannot take the keys.
    box.focus();
    box.select();
  } else if (writing !== null) {
    writing.focus();
    writing.select();
  } else if (held) {
    focusCell(into, showing);
  }

  asking(into, showing, asks);
}

/** The question a refusal asks, over the panel; the one already open stays, so a redraw takes no keyboard back. */
function asking(into: HTMLElement, showing: Showing, asks: Asks): void {
  const open = into.querySelector('.over');
  const refused = showing.refused;

  if (refused === null) {
    if (open === null) return;

    // The keyboard was in the question, and a question that is gone answers no
    // key: without this the grid takes nothing until something is clicked.
    const had = open.contains(document.activeElement);
    open.remove();
    if (had) focusCell(into, showing);
    return;
  }
  if (open?.getAttribute('data-why') === refused.why) return;

  open?.remove();
  const over = refusal(refused, asks);
  into.append(over);
  over.querySelector<HTMLElement>('button')?.focus();
}

/** The keys the page answers rather than a cell, and never where a box of text has them. */
function keyed(into: HTMLElement, event: KeyboardEvent, asks: Asks): void {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return;
  }

  // The search is closed from wherever the reader is, not only from its own
  // box: a bar with no way out is one they have to work around.
  if (event.key === 'Escape') {
    asks.stopLooking();
    return;
  }

  const look = wearing(event);
  if (look !== null) {
    event.preventDefault();
    into.querySelector<HTMLButtonElement>(`button.look.${look}`)?.click();
    return;
  }

  // Without taking it, `Cmd`+`A` selects the panels around the grid as text.
  if (!takingAll(event)) return;
  event.preventDefault();
  asks.takeAll();
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

  for (const cell of grid.querySelectorAll('.selected')) cell.classList.remove('selected');
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

  for (const heading of grid.querySelectorAll<HTMLElement>('th[data-col], th[data-row]')) {
    const across = heading.getAttribute('data-col');
    const at = Number(across ?? heading.getAttribute('data-row'));
    if (headed(showing, across === null ? 'row' : 'column', at)) heading.classList.add('selected');
  }

  for (const key of showing.reached?.cells ?? []) {
    grid.querySelector(`td[data-at="${key}"]`)?.classList.add('reached');
  }

  // The switches say what the *selected* cell wears, so they follow the selection.
  into.querySelector('.toolbar')?.replaceWith(toolbar(showing, asks));

  say(under, showing, asks);
  told(into, showing, asks);
  asking(into, showing, asks);
  fit(into);
}

/** Everything said under the grid, which is rebuilt on its own. */
function say(under: Element, showing: Showing, asks: Asks): void {
  const { drawing } = showing;
  under.replaceChildren();

  const comes = showing.comes === null ? null : comesTo(showing.comes);
  if (comes !== null) under.append(comes);
  if (showing.said !== null) under.append(note(showing.said));
  if (drawing.uncomputed !== null) under.append(note(uncomputed(drawing.uncomputed)));

  const sheet = drawing.sheets[showing.sheet];
  const split = sheet?.split ?? null;
  if (split !== null && (split.x > 0 || split.y > 0)) under.append(note(splitSaid(split)));
  if (sheet?.print != null) under.append(note(sheet.print.says));
  if (sheet?.protect != null) under.append(note(sheet.protect.says));
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

  const over = floats(sheet, asks);
  if (over !== null) box.append(over);

  const paper = printed(sheet);
  if (paper !== null) box.append(paper);

  const bars = splitter(sheet);
  if (bars !== null) box.append(bars);

  box.addEventListener('scroll', () => {
    const at = wanted(sheet, { top: box.scrollTop, left: box.scrollLeft });
    if (at !== null) asks.showWindow(at.row, at.col);
  });

  return box;
}

/** Where the paper falls: the area outlined and a line at each break; the preview does not paginate. */
function printed(sheet: DrawnSheet): HTMLElement | null {
  const print = sheet.print;
  if (print === null || (print.area === null && print.breaks.length === 0)) return null;

  const left = gutterOf(sheet, 'row') + GUTTER;
  const top = gutterOf(sheet, 'column') + HEADING;
  const drawn = document.createElement('div');
  drawn.className = 'paper';

  if (print.area !== null) {
    const box = document.createElement('div');
    box.className = 'area';
    box.style.left = `${left + across(sheet, print.area.left)}px`;
    box.style.top = `${top + down(sheet, print.area.top)}px`;
    box.style.width = `${across(sheet, print.area.right + 1) - across(sheet, print.area.left)}px`;
    box.style.height = `${down(sheet, print.area.bottom + 1) - down(sheet, print.area.top)}px`;
    drawn.append(box);
  }

  for (const at of print.breaks) {
    // A break starts a page above and left of the cell it names, so each one is
    // two lines where neither edge is the sheet's own (`docs/spec.md` §5).
    if (at.col > 1) drawn.append(page('column', left + across(sheet, at.col)));
    if (at.row > 1) drawn.append(page('row', top + down(sheet, at.row)));
  }

  return drawn;
}

function page(axis: 'column' | 'row', at: number): HTMLElement {
  const line = document.createElement('div');
  line.className = `break ${axis}`;
  line.style.setProperty(axis === 'column' ? 'left' : 'top', `${at}px`);
  return line;
}

/** Where a sheet is split, said under the grid: a bar in the sheet has nowhere to say it itself. */
function splitSaid(split: { readonly x: number; readonly y: number }): string {
  const where = [
    split.x > 0 ? `${split.x}pt from the left` : '',
    split.y > 0 ? `${split.y}pt from the top` : '',
  ].filter((one) => one !== '');

  return `This sheet is split ${where.join(' and ')}. The preview draws the splitter where it sits; it does not scroll the panes apart, and the bar does not move.`;
}

/** The splitter, drawn where it sits: the panes do not scroll apart, and the bar does not move. */
function splitter(sheet: DrawnSheet): HTMLElement | null {
  const split = sheet.split;
  if (split === null || (split.x <= 0 && split.y <= 0)) return null;

  const bars = document.createElement('div');
  bars.className = 'splits';

  if (split.x > 0) {
    const bar = document.createElement('div');
    bar.className = 'split column';
    bar.style.left = `${gutterOf(sheet, 'row') + GUTTER + pixelsOf(split.x)}px`;
    bars.append(bar);
  }

  if (split.y > 0) {
    const bar = document.createElement('div');
    bar.className = 'split row';
    bar.style.top = `${gutterOf(sheet, 'column') + HEADING + pixelsOf(split.y)}px`;
    bars.append(bar);
  }

  return bars;
}
