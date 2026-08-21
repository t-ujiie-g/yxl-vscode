import { addrAt } from '@yxl-vscode/units';
import { looking as lookingFor } from './keys';
import { type Asks, GUTTER, HEADING, type Looking, type Showing } from './showing';

/** The two boxes outside the grid, said again: the address the reader is on, and how far through a search. */
export function told(into: HTMLElement, showing: Showing): void {
  const address = into.querySelector<HTMLInputElement>('.corner .address');
  if (address !== null && document.activeElement !== address) {
    address.value = showing.selected === null ? '' : addrAt(showing.selected);
  }

  const count = into.querySelector('.looking .count');
  if (count !== null && showing.looking !== null) count.textContent = counted(showing.looking);
}

/** The corner above the row numbers, which is where every spreadsheet keeps the address box. */
export function corner(showing: Showing, asks: Asks): HTMLElement {
  const cell = document.createElement('th');
  cell.className = 'corner';
  cell.style.width = `${GUTTER}px`;

  const box = document.createElement('input');
  box.type = 'text';
  box.className = 'address';
  // The box is what makes the heading row as tall as it is, and a frozen row is
  // put under that; the other pixel is the line beneath the headings.
  box.style.height = `${HEADING - 1}px`;
  box.value = showing.selected === null ? '' : addrAt(showing.selected);
  box.title = 'Go to an address';
  box.setAttribute('aria-label', 'Go to an address');
  box.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') asks.goTo(box.value);
    if (event.key === 'Escape') box.blur();
  });

  cell.append(box);
  return cell;
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
