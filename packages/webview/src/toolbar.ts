import {
  BORDER_EDGES,
  BORDER_STYLES,
  type BorderEdgeName,
  type BorderStyle,
  type HAlign,
  type StyleProperty,
  type StyleSays,
  type StyleValues,
  type VAlign,
} from '@yxl-vscode/spec';
import { type Color, parseColor, type Rect } from '@yxl-vscode/units';
import { underFormat } from './cell';
import { between } from './keys';
import { ACROSS, type Bar, DOWN, framed, marked, RAGGED } from './marks';
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
  bar.append(gap());
  for (const one of EDGES) bar.append(edge(one, showing, asks));
  bar.append(lines(showing, asks));

  return bar;
}

/** The space between one group of controls and the next. */
function gap(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'gap';
  return span;
}

/** The rectangle the toolbar was drawn over, which is what its controls act on. */
function over(showing: Showing): Rect {
  const at = showing.selected ?? { row: 1, col: 1 };
  return between(at, showing.anchor ?? at);
}

/** What the cell the reader has selected wears, which is what the toolbar shows. */
function wornBy(showing: Showing): StyleValues {
  return cellOf(showing)?.style ?? {};
}

/** The cell the reader has selected, where the drawing holds one. */
function cellOf(showing: Showing): DrawnCell | undefined {
  const at = showing.selected;
  if (at === null) return undefined;

  const cells = showing.drawing.sheets[showing.sheet]?.cells ?? [];
  return cells.find((one: DrawnCell) => one.row === at.row && one.col === at.col);
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

/** One place the text can sit; pressing the one that already holds takes it off (ADR-039). */
interface Pick {
  readonly key: 'align.horizontal' | 'align.vertical';
  readonly value: HAlign | VAlign;
  readonly name: string;
  readonly says: string;
  readonly bars: readonly Bar[];
}

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

/** A colour as the picker takes one: six digits behind a `#`, an eight-digit form's alpha dropped. */
function picked(of: Color): string {
  const digits = of.startsWith('#') ? of.slice(1) : of;
  return `#${digits.length === 8 ? digits.slice(2) : digits}`;
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

/** One border a reader draws: which edges it puts the line on, or takes it off. */
interface Edge {
  readonly name: string;
  readonly says: string;
  readonly sides: readonly BorderEdgeName[];
}

const EDGES: readonly Edge[] = [
  { name: 'all', says: 'All borders', sides: BORDER_EDGES },
  { name: 'top', says: 'Top border', sides: ['top'] },
  { name: 'bottom', says: 'Bottom border', sides: ['bottom'] },
  { name: 'left', says: 'Left border', sides: ['left'] },
  { name: 'right', says: 'Right border', sides: ['right'] },
  { name: 'none', says: 'No borders', sides: [] },
];

/** A border on the edges it names, with the line the toolbar is set to; these act rather than hold, so none is lit. */
function edge(of: Edge, showing: Showing, asks: Asks): HTMLElement {
  const button = document.createElement('button');

  button.type = 'button';
  button.className = `look edge ${of.name}`;
  button.title = of.says;
  button.disabled = showing.selected === null;
  button.append(marked(framed(of.sides)));
  button.addEventListener('click', () => asks.wear(drawn(of, showing.line), over(showing)));

  return button;
}

/** What a border button asks for: the line on the edges it names, or every edge taken away. */
function drawn(of: Edge, line: BorderStyle): StyleSays {
  if (of.sides.length === 0) {
    return Object.fromEntries(
      BORDER_EDGES.flatMap((side) => [
        [`border.${side}.style`, null],
        [`border.${side}.color`, null],
      ]),
    ) as StyleSays;
  }

  return Object.fromEntries(of.sides.map((side) => [`border.${side}.style`, line])) as StyleSays;
}

/** The line the border buttons draw with, which is the reader's choice and not the cell's. */
function lines(showing: Showing, asks: Asks): HTMLElement {
  const box = document.createElement('select');

  box.className = 'look numbers';
  box.title = 'The line a border is drawn with';
  box.disabled = showing.selected === null;

  for (const style of BORDER_STYLES) {
    const option = document.createElement('option');
    option.value = style;
    option.textContent = style;
    option.selected = style === showing.line;
    box.append(option);
  }

  box.addEventListener('change', () => {
    const chosen = BORDER_STYLES.find((one) => one === box.value);
    if (chosen !== undefined) asks.drawWith(chosen);
  });

  return box;
}

/** The formats a toolbar offers, by their codes: what each is called depends on the cell. */
const NUMBERS: readonly (string | null)[] = [
  null,
  '#,##0',
  '#,##0.00',
  '0.00',
  '0%',
  '0.0%',
  'yyyy-mm-dd',
  'h:mm',
];

/** A number format, said as what it would make of the number this cell holds. */
function numbers(showing: Showing, asks: Asks): HTMLElement {
  const of = cellOf(showing);
  const now = wornBy(showing).format ?? null;
  const box = document.createElement('select');

  box.className = 'look numbers';
  box.title = now === null ? 'Number format' : `Number format: ${now}`;
  box.disabled = showing.selected === null;

  const known = NUMBERS.includes(now);
  for (const code of known ? NUMBERS : [...NUMBERS, now]) {
    const option = document.createElement('option');
    option.value = code ?? '';
    option.textContent = says(code, of);
    option.title = code ?? '';
    option.selected = code === now;
    box.append(option);
  }

  const where = over(showing);
  box.addEventListener('change', () => {
    asks.wear({ format: box.value === '' ? null : box.value }, where);
  });

  return box;
}

/** What a format is called here: what it would make of this cell's number, or the code where there is none. */
function says(code: string | null, of: DrawnCell | undefined): string {
  if (code === null) return 'General';

  return (of === undefined ? null : underFormat(of, code)) ?? code;
}
