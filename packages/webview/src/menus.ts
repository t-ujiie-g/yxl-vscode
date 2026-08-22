import type { Asks, Showing } from './showing';

/**
 * A control that opens a panel under it, which is how every spreadsheet holds a
 * palette: the button says what is set, the panel holds the choices.
 */
export interface Menu {
  readonly name: string;
  readonly title: string;
  readonly disabled: boolean;
  readonly marks: readonly Node[];
}

/** The control, and where it is open the panel with the scrim that closes it. */
export function opens(
  of: Menu,
  showing: Showing,
  asks: Asks,
  panel: () => HTMLElement,
): HTMLElement {
  const open = showing.menu === of.name && !of.disabled;
  const box = document.createElement('span');
  box.className = 'menu';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `look opener ${of.name}${open ? ' on' : ''}`;
  button.title = of.title;
  button.disabled = of.disabled;
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  button.append(...of.marks, caret());
  button.addEventListener('click', () => asks.openMenu(open ? null : of.name));
  box.append(button);

  if (!open) return box;

  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.addEventListener('mousedown', () => asks.openMenu(null));

  const under = panel();
  under.classList.add('panel');
  box.append(scrim, under);
  box.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    asks.openMenu(null);
  });

  return box;
}

/** One line of a panel: a name, and what taking it does. */
export function entry(
  says: string,
  of: { disabled?: boolean; className?: string },
  taken: () => void,
): HTMLElement {
  const one = document.createElement('button');
  one.type = 'button';
  one.className = `entry${of.className === undefined ? '' : ` ${of.className}`}`;
  one.textContent = says;
  one.disabled = of.disabled === true;
  one.addEventListener('click', taken);
  return one;
}

/** A panel that would hang past the edge of the view, pulled back onto it. */
export function fit(into: HTMLElement): void {
  const panel = into.querySelector<HTMLElement>('.panel');
  if (panel === null) return;

  const past = panel.getBoundingClientRect().right - document.documentElement.clientWidth + 8;
  if (past > 0) panel.style.left = `${-past}px`;
}

function caret(): HTMLElement {
  const mark = document.createElement('span');
  mark.className = 'caret';
  mark.textContent = '▾';
  return mark;
}

/**
 * The menu a heading opens on a right-click, where a spreadsheet keeps what
 * there is no room for on a bar. It is put at the pointer and closed by the
 * same scrim a toolbar menu uses.
 */
export function pointedAt(
  showing: Showing,
  asks: Asks,
  entries: readonly HTMLElement[],
): HTMLElement | null {
  const at = showing.pointed;
  if (at === null || entries.length === 0) return null;

  const box = document.createElement('div');
  box.className = 'menu pointed';

  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.addEventListener('mousedown', () => asks.pointAt(null));

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.left = `${at.x}px`;
  panel.style.top = `${at.y}px`;
  panel.append(...entries);

  box.append(scrim, panel);
  box.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    asks.pointAt(null);
  });

  return box;
}
