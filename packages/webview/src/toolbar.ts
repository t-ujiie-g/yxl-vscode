import type { StyleProperty, StyleValues, StyleWant } from '@yxl-vscode/spec';
import { type Color, parseColor, type Rect } from '@yxl-vscode/units';
import { between } from './keys';
import type { DrawnCell } from './protocol';
import type { Asks, Showing } from './showing';

/** The looks a reader reaches for first, over the cells they have selected. */
export function toolbar(showing: Showing, asks: Asks): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'toolbar';
  for (const one of TOGGLES) bar.append(toggle(one, showing, asks));
  for (const one of INKS) bar.append(...ink(one, showing, asks));

  return bar;
}

interface Toggle {
  readonly key: StyleProperty;
  readonly name: string;
  readonly mark: string;
  readonly says: string;
}

const TOGGLES: readonly Toggle[] = [
  { key: 'font.bold', name: 'bold', mark: 'B', says: 'Bold' },
  { key: 'font.italic', name: 'italic', mark: 'I', says: 'Italic' },
  { key: 'font.underline', name: 'underline', mark: 'U', says: 'Underline' },
  { key: 'font.strike', name: 'strike', mark: 'S', says: 'Strikethrough' },
];

interface Ink {
  readonly key: 'font.color' | 'fill';
  readonly name: string;
  readonly mark: string;
  readonly says: string;
  readonly clears: string;
  readonly opens: string;
}

const INKS: readonly Ink[] = [
  {
    key: 'font.color',
    name: 'ink',
    mark: 'A',
    says: 'Text colour',
    clears: 'Automatic text colour',
    opens: '#000000',
  },
  {
    key: 'fill',
    name: 'fill',
    mark: '■',
    says: 'Fill',
    clears: 'No fill',
    opens: '#ffffff',
  },
];

/** One switch, showing what the selected cell wears and asking for the other of it. */
function toggle(of: Toggle, showing: Showing, asks: Asks): HTMLElement {
  const on = wornBy(showing)[of.key] === true;
  const button = document.createElement('button');

  button.type = 'button';
  button.className = `look ${of.name}${on ? ' on' : ''}`;
  button.textContent = of.mark;
  button.title = of.says;
  button.disabled = showing.selected === null;
  button.setAttribute('aria-pressed', on ? 'true' : 'false');
  button.addEventListener('click', () => asks.wear({ [of.key]: !on } as StyleWant, over(showing)));

  return button;
}

/** A colour, as the swatch the selected cell wears and the button that takes it off. */
function ink(of: Ink, showing: Showing, asks: Asks): HTMLElement[] {
  const now = wornBy(showing)[of.key] ?? null;
  const nowhere = showing.selected === null;

  const swatch = document.createElement('label');
  swatch.className = `look ${of.name}`;
  swatch.title = of.says;
  swatch.append(of.mark);
  swatch.style.setProperty('border-bottom-color', now === null ? 'transparent' : picked(now));

  const pick = document.createElement('input');
  pick.type = 'color';
  pick.className = 'pick';
  pick.value = now === null ? of.opens : picked(now);
  pick.disabled = nowhere;
  // The picker commits when it is dismissed, by which time the reader may have
  // selected something else, so the rectangle is the one it was opened over.
  const where = over(showing);
  pick.addEventListener('change', () => {
    // The picker says `#rrggbb`; a spec writes `RRGGBB` (`docs/spec.md` §6).
    const colour = parseColor(pick.value.replace('#', '').toUpperCase());
    if (colour !== null) asks.wear({ [of.key]: colour } as StyleWant, where);
  });
  swatch.append(pick);

  const off = document.createElement('button');
  off.type = 'button';
  off.className = `look off ${of.name}`;
  off.textContent = '×';
  off.title = of.clears;
  off.disabled = nowhere || now === null;
  off.addEventListener('click', () => asks.wear({ [of.key]: null } as StyleWant, where));

  return [swatch, off];
}

/** The rectangle the toolbar was drawn over, which is what its controls act on. */
function over(showing: Showing): Rect {
  const at = showing.selected ?? { row: 1, col: 1 };
  return between(at, showing.anchor ?? at);
}

/** What the cell the reader has selected wears, which is what the toolbar shows. */
function wornBy(showing: Showing): StyleValues {
  const at = showing.selected;
  if (at === null) return {};

  const cells = showing.drawing.sheets[showing.sheet]?.cells ?? [];
  return cells.find((one: DrawnCell) => one.row === at.row && one.col === at.col)?.style ?? {};
}

/** A colour as the picker takes one: six digits behind a `#`, an eight-digit form's alpha dropped. */
function picked(of: Color): string {
  const digits = of.startsWith('#') ? of.slice(1) : of;
  return `#${digits.length === 8 ? digits.slice(2) : digits}`;
}
