import type { HAlign, StyleProperty, StyleSays, StyleValues, VAlign } from '@yxl-vscode/spec';
import { type Color, parseColor, type Rect } from '@yxl-vscode/units';
import { between } from './keys';
import type { DrawnCell } from './protocol';
import type { Asks, Showing } from './showing';

/** The looks a reader reaches for first, over the cells they have selected. */
export function toolbar(showing: Showing, asks: Asks): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'toolbar';

  for (const one of TOGGLES) bar.append(toggle(one, showing, asks));
  bar.append(gap());
  for (const one of INKS) bar.append(...ink(one, showing, asks));
  bar.append(gap());
  for (const one of PICKS) bar.append(pick(one, showing, asks));
  bar.append(toggle(WRAP, showing, asks));
  bar.append(gap());
  bar.append(numbers(showing, asks));

  return bar;
}

/** The space between one group of controls and the next. */
function gap(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'gap';
  return span;
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

const WRAP: Toggle = { key: 'align.wrap', name: 'wrap', mark: '\u21b5', says: 'Wrap text' };

/** One place the text can sit; pressing the one that already holds takes it off (ADR-039). */
interface Pick {
  readonly key: 'align.horizontal' | 'align.vertical';
  readonly value: HAlign | VAlign;
  readonly name: string;
  readonly says: string;
  readonly bars: readonly Bar[];
}

interface Bar {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

const ACROSS = [2, 5.6, 9.2, 12.8];
const DOWN = [0, 2.8, 5.6];
const RAGGED = [12, 8, 12, 8];

const PICKS: readonly Pick[] = [
  {
    key: 'align.horizontal',
    value: 'left',
    name: 'left',
    says: 'Align left',
    bars: ACROSS.map((y, row) => ({ x: 2, y, width: RAGGED[row] ?? 12 })),
  },
  {
    key: 'align.horizontal',
    value: 'center',
    name: 'centre',
    says: 'Align centre',
    bars: ACROSS.map((y, row) => ({
      x: (16 - (RAGGED[row] ?? 12)) / 2,
      y,
      width: RAGGED[row] ?? 12,
    })),
  },
  {
    key: 'align.horizontal',
    value: 'right',
    name: 'right',
    says: 'Align right',
    bars: ACROSS.map((y, row) => ({ x: 14 - (RAGGED[row] ?? 12), y, width: RAGGED[row] ?? 12 })),
  },
  {
    key: 'align.vertical',
    value: 'top',
    name: 'top',
    says: 'Align top',
    bars: DOWN.map((y) => ({ x: 3, y: y + 2, width: 10 })),
  },
  {
    key: 'align.vertical',
    value: 'middle',
    name: 'middle',
    says: 'Align middle',
    bars: DOWN.map((y) => ({ x: 3, y: y + 4.2, width: 10 })),
  },
  {
    key: 'align.vertical',
    value: 'bottom',
    name: 'bottom',
    says: 'Align bottom',
    bars: DOWN.map((y) => ({ x: 3, y: y + 6.4, width: 10 })),
  },
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
  button.addEventListener('click', () => asks.wear({ [of.key]: !on } as StyleSays, over(showing)));

  return button;
}

/** One of a group, showing where the text sits and asking for it there — or, where it already is, nowhere. */
function pick(of: Pick, showing: Showing, asks: Asks): HTMLElement {
  const on = wornBy(showing)[of.key] === of.value;
  const button = document.createElement('button');

  button.type = 'button';
  button.className = `look ${of.name}${on ? ' on' : ''}`;
  button.title = of.says;
  button.disabled = showing.selected === null;
  button.setAttribute('aria-pressed', on ? 'true' : 'false');
  button.append(marked(of.bars));
  button.addEventListener('click', () =>
    asks.wear({ [of.key]: on ? null : of.value } as StyleSays, over(showing)),
  );

  return button;
}

/** A mark drawn as the bars of text it stands for, which is how a spreadsheet draws this. */
function marked(bars: readonly Bar[]): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');

  for (const bar of bars) {
    const drawn = document.createElementNS(SVG, 'rect');
    drawn.setAttribute('x', String(bar.x));
    drawn.setAttribute('y', String(bar.y));
    drawn.setAttribute('width', String(bar.width));
    drawn.setAttribute('height', '1.6');
    drawn.setAttribute('rx', '0.6');
    svg.append(drawn);
  }

  return svg;
}

const SVG = 'http://www.w3.org/2000/svg';

/** A number format, chosen from what a reader reaches for and shown as what it makes of a number. */
function numbers(showing: Showing, asks: Asks): HTMLElement {
  const now = wornBy(showing).format ?? null;
  const box = document.createElement('select');

  box.className = 'look numbers';
  box.title = now === null ? 'Number format' : `Number format: ${now}`;
  box.disabled = showing.selected === null;

  const known = NUMBERS.some((one) => one.code === now);
  for (const one of known ? NUMBERS : [...NUMBERS, { says: now ?? '', code: now }]) {
    const option = document.createElement('option');
    option.value = one.code ?? '';
    option.textContent = one.says;
    option.selected = one.code === now;
    box.append(option);
  }

  const where = over(showing);
  box.addEventListener('change', () => {
    asks.wear({ format: box.value === '' ? null : box.value }, where);
  });

  return box;
}

/** The formats a toolbar offers, said as what each makes of a number rather than as its code. */
interface Numbers {
  readonly says: string;
  readonly code: string | null;
}

const NUMBERS: readonly Numbers[] = [
  { says: 'General', code: null },
  { says: '1,235', code: '#,##0' },
  { says: '1,234.57', code: '#,##0.00' },
  { says: '1234.57', code: '0.00' },
  { says: '12%', code: '0%' },
  { says: '12.3%', code: '0.0%' },
  { says: '2026-08-20', code: 'yyyy-mm-dd' },
  { says: '13:45', code: 'h:mm' },
];

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
    if (colour !== null) asks.wear({ [of.key]: colour } as StyleSays, where);
  });
  swatch.append(pick);

  const off = document.createElement('button');
  off.type = 'button';
  off.className = `look off ${of.name}`;
  off.textContent = '×';
  off.title = of.clears;
  off.disabled = nowhere || now === null;
  off.addEventListener('click', () => asks.wear({ [of.key]: null } as StyleSays, where));

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
