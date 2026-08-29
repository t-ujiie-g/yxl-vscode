import { addrAt } from '@yxl-vscode/units';
import { breaking, written } from './cell';
import { looking as lookingFor } from './keys';
import type { DrawnRun } from './protocol';
import { type Asks, cellOf, GUTTER, type Looking, type Showing } from './showing';
import { chrome } from './worded';

/**
 * The boxes outside the grid, said again. The bar is *rebuilt* rather than
 * written into, because what it sends is about the cell selected now — unless
 * the reader is typing in it, whose text is theirs until they leave.
 */
export function told(into: HTMLElement, showing: Showing, asks: Asks): void {
  const bar = into.querySelector('.formula');
  if (bar !== null && !bar.contains(document.activeElement)) {
    bar.replaceWith(formulaBar(showing, asks));
  }

  const looking = showing.looking;
  const count = into.querySelector('.looking .count');
  if (count === null || looking === null) return;

  // Written into rather than rebuilt, for the same reason the bar above is: the
  // reader is typing in one of these boxes.
  count.textContent = counted(looking);
  const one = into.querySelector<HTMLButtonElement>('.looking .swap:not(.all)');
  const all = into.querySelector<HTMLButtonElement>('.looking .swap.all');
  if (one !== null) one.disabled = looking.at < 0;
  if (all !== null) all.disabled = looking.cells.length === 0;
}

/** The corner above the row numbers: the button that takes the whole sheet, as everywhere else. */
export function corner(asks: Asks, left = 0): HTMLElement {
  const cell = document.createElement('th');
  cell.className = 'corner';
  cell.style.width = `${GUTTER}px`;
  cell.style.left = `${left}px`;

  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'all';
  all.title = chrome('view.select-whole-sheet');
  all.setAttribute('aria-label', all.title);
  all.addEventListener('click', () => asks.takeAll());

  cell.append(all);
  return cell;
}

/**
 * The bar above the grid: where the reader is, and what that cell *holds* — the
 * formula rather than what it comes to (ADR-014), typed into here as into the
 * cell, or one run at a time where the cell holds runs (`docs/spec.md` §3).
 */
export function formulaBar(showing: Showing, asks: Asks): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'formula';

  const at = document.createElement('input');
  at.type = 'text';
  at.className = 'address';
  at.value = showing.selected === null ? '' : addrAt(showing.selected);
  at.title = chrome('view.go-to-an-address');
  at.setAttribute('aria-label', at.title);
  at.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') asks.goTo(at.value);
    if (event.key === 'Escape') at.blur();
  });

  const mark = document.createElement('span');
  mark.className = 'fx';
  mark.textContent = 'fx';

  // A `textarea`: an `input` strips the line breaks out of its own value, so a
  // cell holding two lines would be written back as one.
  const holds = document.createElement('textarea');
  const cell = cellOf(showing);
  const runs = cell?.rich ?? null;
  let run = runs === null ? 0 : Math.min(showing.run, runs.length - 1);
  const said = (): string => (runs === null ? written(cell) : (runs[run]?.text ?? ''));

  holds.className = 'holds';
  holds.value = said();
  holds.rows = rowsOf(holds.value);
  holds.disabled = showing.selected === null;
  holds.title =
    runs === null ? chrome('view.what-this-cell-holds') : chrome('view.what-this-run-says');
  holds.setAttribute('aria-label', holds.title);
  holds.addEventListener('input', () => {
    holds.rows = rowsOf(holds.value);
  });
  holds.addEventListener('keydown', (event) => {
    event.stopPropagation();
    const where = showing.selected;

    if (breaking(event)) return;
    if (event.key === 'Enter' && where !== null) {
      event.preventDefault();
      if (runs === null) asks.edit(where.row, where.col, holds.value);
      else asks.editRun(where.row, where.col, run, holds.value);
      holds.blur();
    }
    if (event.key === 'Escape') {
      holds.value = said();
      holds.blur();
    }
  });

  bar.append(at, mark);
  if (runs !== null) {
    bar.append(
      picker(runs, run, (index) => {
        run = index;
        holds.value = said();
        holds.rows = rowsOf(holds.value);
        asks.showRun(index);
      }),
    );
  }
  bar.append(holds);

  return bar;
}

/** Which run of a rich cell the bar is on; a run is the unit the spec writes and the unit edited. */
function picker(runs: readonly DrawnRun[], at: number, take: (index: number) => void): HTMLElement {
  const box = document.createElement('select');
  box.className = 'runs';
  box.title = chrome('view.which-run-to-edit');
  box.setAttribute('aria-label', box.title);

  for (const [index, run] of runs.entries()) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = `${index + 1}. ${shortened(run.text)}`;
    option.selected = index === at;
    box.append(option);
  }

  box.addEventListener('keydown', (event) => event.stopPropagation());
  box.addEventListener('change', () => take(Number(box.value)));

  return box;
}

/** How much of a run the picker names it by, since a run may be a paragraph. */
const NAMED = 24;

function shortened(text: string): string {
  const said = text.replace(/\s+/g, ' ').trim();
  return said.length > NAMED ? `${said.slice(0, NAMED)}…` : said;
}

/** How many lines the bar shows before it scrolls instead, so one long value cannot take the panel. */
function rowsOf(text: string): number {
  return Math.min(6, text.split('\n').length);
}

/** The bar `Cmd`+`F` opens: what is being looked for, how much of it there is, and the way through it. */
export function findBar(what: Looking, asks: Asks): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'looking';

  const mark = document.createElement('span');
  mark.className = 'mark';
  mark.textContent = 'Find';

  const box = document.createElement('input');
  box.type = 'text';
  box.className = 'for';
  box.value = what.text;
  box.placeholder = chrome('view.find-in-this-sheet');
  box.addEventListener('input', () => asks.look(box.value));
  box.addEventListener('keydown', (event) => {
    event.stopPropagation();

    // The reader is in the box, so the cell's own handler never sees these.
    const through = lookingFor(event);
    if (through === 'on' || through === 'back') {
      event.preventDefault();
      asks.goOn(through === 'on' ? 1 : -1);
      return;
    }

    if (event.key === 'Enter') asks.goOn(event.shiftKey ? -1 : 1);
    if (event.key === 'Escape') asks.stopLooking();
  });

  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = counted(what);

  bar.append(mark, box, count, step('‹', -1, asks), step('›', 1, asks));
  bar.append(...replacing(what, asks));

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'step close';
  close.textContent = '✕';
  close.title = chrome('view.close-the-search-key');
  close.setAttribute('aria-label', chrome('view.close-the-search'));
  close.addEventListener('click', () => asks.stopLooking());
  bar.append(close);

  return bar;
}

/** What goes in the place of what was found: the one the reader is on, or every cell of it. */
function replacing(what: Looking, asks: Asks): HTMLElement[] {
  const box = document.createElement('input');
  box.type = 'text';
  box.className = 'with';
  box.value = what.becomes;
  box.placeholder = chrome('view.replace-with');
  box.addEventListener('input', () => asks.replaceWith(box.value));
  box.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') asks.replace(false);
    if (event.key === 'Escape') asks.stopLooking();
  });

  const one = document.createElement('button');
  one.type = 'button';
  one.className = 'swap';
  one.textContent = chrome('view.replace');
  one.disabled = what.at < 0;
  one.title = what.at < 0 ? chrome('view.go-to-one-first') : chrome('view.replace-the-one');
  one.addEventListener('click', () => asks.replace(false));

  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'swap all';
  all.textContent = chrome('view.replace-all');
  all.disabled = what.cells.length === 0;
  all.addEventListener('click', () => asks.replace(true));

  return [box, one, all];
}

/** How far through what was found, or that there was none of it. */
function counted(what: Looking): string {
  if (what.cells.length > 0) {
    return chrome('view.which-of-them', {
      at: Math.max(what.at, 0) + 1,
      of: what.cells.length,
    });
  }

  return what.text === '' ? '' : chrome('view.nothing-holds-that');
}

function step(mark: string, by: number, asks: Asks): HTMLElement {
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'step';
  go.textContent = mark;
  go.addEventListener('click', () => asks.goOn(by));
  return go;
}
