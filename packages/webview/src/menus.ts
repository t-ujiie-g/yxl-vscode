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

/** The tooltip a webview draws itself: the browser's own never appears in one. */
export function says(on: HTMLElement, text: string): void {
  on.classList.add('saying');
  on.setAttribute('data-says', text);
  on.setAttribute('aria-label', text);
}

/** One of a list, offered as the box a spreadsheet keeps its fonts and formats in. */
export function chosen(of: Chosen): HTMLElement {
  const box = document.createElement('select');
  box.className = `look ${of.name}`;
  box.disabled = of.disabled;

  for (const one of of.options) {
    const option = document.createElement('option');
    option.value = one.value;
    option.textContent = one.text;
    option.title = one.code ?? '';
    option.selected = one.value === of.now;
    box.append(option);
  }

  box.addEventListener('change', () => of.take(box.value));

  // Wrapped, since a tooltip is drawn with `::after` and a `select` has no
  // room inside it for one.
  const held = document.createElement('span');
  held.className = 'held';
  says(held, of.said);
  held.append(box);

  return held;
}

export interface Chosen {
  readonly name: string;
  readonly said: string;
  readonly now: string;
  readonly disabled: boolean;
  readonly options: readonly { value: string; text: string; code?: string | null }[];
  readonly take: (value: string) => void;
}

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
  says(button, of.title);
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
  said: string,
  of: { disabled?: boolean; className?: string; chord?: string },
  taken: () => void,
): HTMLElement {
  const one = document.createElement('button');
  one.type = 'button';
  one.className = `entry${of.className === undefined ? '' : ` ${of.className}`}`;
  one.textContent = said;
  one.disabled = of.disabled === true;
  one.addEventListener('click', taken);

  if (of.chord !== undefined) {
    const chord = document.createElement('span');
    chord.className = 'chord';
    chord.textContent = of.chord;
    one.append(chord);
  }

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

/** The colours a palette offers: the two rows of standards a reader of Sheets or Excel knows. */
const PALETTE: readonly string[] = [
  '000000',
  '434343',
  '666666',
  '999999',
  'B7B7B7',
  'CCCCCC',
  'D9D9D9',
  'EFEFEF',
  'F3F3F3',
  'FFFFFF',
  '980000',
  'FF0000',
  'FF9900',
  'FFFF00',
  '00FF00',
  '00FFFF',
  '4A86E8',
  '0000FF',
  '9900FF',
  'FF00FF',
];

/**
 * The standard swatches and one of the reader's own, as every palette in this
 * view offers them. `now` and what `take` is given are `RRGGBB`, which is how a
 * spec writes a colour (`docs/spec.md` §6).
 */
export function swatches(
  now: string | null,
  opens: string,
  take: (digits: string) => void,
): HTMLElement[] {
  const grid = document.createElement('div');
  grid.className = 'swatches';

  for (const digits of PALETTE) {
    const one = document.createElement('button');
    one.type = 'button';
    one.className = now?.toLowerCase() === digits.toLowerCase() ? 'swatch here' : 'swatch';
    one.title = `#${digits}`;
    one.style.background = `#${digits}`;
    one.addEventListener('click', () => take(digits));
    grid.append(one);
  }

  const custom = document.createElement('label');
  custom.className = 'entry custom';
  custom.append('Custom\u2026');

  const pick = document.createElement('input');
  pick.type = 'color';
  pick.className = 'pick';
  pick.value = now === null ? opens : `#${now}`;
  // The picker says `#rrggbb`; a spec writes `RRGGBB`.
  pick.addEventListener('change', () => take(pick.value.replace('#', '').toUpperCase()));

  custom.append(pick);
  return [grid, custom];
}
