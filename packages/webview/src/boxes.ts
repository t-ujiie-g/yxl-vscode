import { addrAt } from '@yxl-vscode/units';
import { written } from './cell';
import { looking as lookingFor } from './keys';
import { type Asks, GUTTER, type Looking, type Showing } from './showing';

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

  const count = into.querySelector('.looking .count');
  if (count !== null && showing.looking !== null) count.textContent = counted(showing.looking);
}

/** The corner above the row numbers: the button that takes the whole sheet, as everywhere else. */
export function corner(asks: Asks): HTMLElement {
  const cell = document.createElement('th');
  cell.className = 'corner';
  cell.style.width = `${GUTTER}px`;

  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'all';
  all.title = 'Select the whole sheet';
  all.setAttribute('aria-label', 'Select the whole sheet');
  all.addEventListener('click', () => asks.takeAll());

  cell.append(all);
  return cell;
}

/**
 * The bar above the grid: where the reader is, and what that cell *holds* —
 * the formula rather than what it comes to (ADR-014), typed into here as it is
 * typed into the cell.
 */
export function formulaBar(showing: Showing, asks: Asks): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'formula';

  const at = document.createElement('input');
  at.type = 'text';
  at.className = 'address';
  at.value = showing.selected === null ? '' : addrAt(showing.selected);
  at.title = 'Go to an address';
  at.setAttribute('aria-label', 'Go to an address');
  at.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') asks.goTo(at.value);
    if (event.key === 'Escape') at.blur();
  });

  const mark = document.createElement('span');
  mark.className = 'fx';
  mark.textContent = 'fx';

  const holds = document.createElement('input');
  const cell = cellOf(showing);
  holds.type = 'text';
  holds.className = 'holds';
  holds.value = written(cell);
  holds.disabled = showing.selected === null;
  holds.title = 'What this cell holds';
  holds.setAttribute('aria-label', 'What this cell holds');
  holds.addEventListener('keydown', (event) => {
    event.stopPropagation();
    const where = showing.selected;
    if (event.key === 'Enter' && where !== null) {
      asks.edit(where.row, where.col, holds.value);
      holds.blur();
    }
    if (event.key === 'Escape') {
      holds.value = written(cell);
      holds.blur();
    }
  });

  bar.append(at, mark, holds);
  return bar;
}

/** The cell the reader is on, where the drawing holds one. */
function cellOf(showing: Showing) {
  const at = showing.selected;
  if (at === null) return undefined;

  const cells = showing.drawing.sheets[showing.sheet]?.cells ?? [];
  return cells.find((one) => one.row === at.row && one.col === at.col);
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
  box.placeholder = 'Find in this sheet';
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
  return bar;
}

/** How far through what was found, or that there was none of it. */
function counted(what: Looking): string {
  if (what.cells.length > 0) return `${Math.max(what.at, 0) + 1} of ${what.cells.length}`;

  return what.text === '' ? '' : 'nothing here holds that';
}

function step(mark: string, by: number, asks: Asks): HTMLElement {
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'step';
  go.textContent = mark;
  go.addEventListener('click', () => asks.goOn(by));
  return go;
}
