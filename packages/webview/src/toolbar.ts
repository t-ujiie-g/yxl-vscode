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
import { addrAt, type Color, parseColor, type Rect } from '@yxl-vscode/units';
import { underFormat } from './cell';
import { between } from './keys';
import { ACROSS, type Bar, DOWN, framed, frozen, marked, RAGGED } from './marks';
import { entry, opens } from './menus';
import type { DrawnCell } from './protocol';
import type { Asks, Showing } from './showing';

/** What a reader reaches for first: the look of the cells they have selected, and where the sheet is frozen. */
export function toolbar(showing: Showing, asks: Asks): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'toolbar';

  for (const one of TOGGLES) bar.append(toggle(one, showing, asks));
  bar.append(divider());
  for (const one of INKS) bar.append(ink(one, showing, asks));
  bar.append(divider());
  for (const one of PICKS) {
    if (one.key === 'align.vertical' && one.value === 'top') bar.append(divider());
    bar.append(pick(one, showing, asks));
  }
  bar.append(toggle(WRAP, showing, asks));
  bar.append(divider());
  bar.append(numbers(showing, asks));
  bar.append(divider());
  bar.append(borders(showing, asks));
  bar.append(panes(showing, asks));

  return bar;
}

/** Where the sheet's panes are frozen, as the menu every spreadsheet keeps it in. */
function panes(showing: Showing, asks: Asks): HTMLElement {
  const at = showing.selected;
  const stays = showing.drawing.sheets[showing.sheet]?.freeze ?? null;

  return opens(
    { name: 'freeze', title: 'Freeze panes', disabled: false, marks: [marked(frozen())] },
    showing,
    asks,
    () => {
      const panel = document.createElement('div');
      const upTo = at === null ? 'the selected cell' : addrAt(at);
      const taken = (to: typeof at) => {
        asks.openMenu(null);
        asks.freeze(to);
      };

      panel.append(
        entry(
          `Freeze up to ${upTo}`,
          { disabled: at === null || (at.row === 1 && at.col === 1) },
          () => taken(at),
        ),
        entry('No frozen panes', { disabled: stays === null }, () => taken(null)),
      );
      return panel;
    },
  );
}

/** The rule between one group of controls and the next. */
function divider(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'divider';
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

/** How a shortcut is written on the reader's own keyboard. */
const HELD = navigator.userAgent.includes('Mac') ? '\u2318' : 'Ctrl+';

interface Toggle {
  readonly key: StyleProperty;
  readonly name: string;
  readonly mark: string;
  readonly says: string;
  readonly chord?: string;
}

const TOGGLES: readonly Toggle[] = [
  { key: 'font.bold', name: 'bold', mark: 'B', says: 'Bold', chord: `${HELD}B` },
  { key: 'font.italic', name: 'italic', mark: 'I', says: 'Italic', chord: `${HELD}I` },
  { key: 'font.underline', name: 'underline', mark: 'U', says: 'Underline', chord: `${HELD}U` },
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
  button.title = of.chord === undefined ? of.says : `${of.says} (${of.chord})`;
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

/** A colour, as the swatch the selected cell wears over the palette that sets it. */
function ink(of: Ink, showing: Showing, asks: Asks): HTMLElement {
  const now = wornBy(showing)[of.key] ?? null;

  const mark = document.createElement('span');
  mark.className = 'letter';
  mark.textContent = of.mark;
  mark.style.setProperty('border-bottom-color', now === null ? 'transparent' : picked(now));

  const menu = {
    name: of.name,
    title: of.says,
    disabled: showing.selected === null,
    marks: [mark],
  };
  return opens(menu, showing, asks, () => palette(of, now, showing, asks));
}

/** The panel a colour is picked from: the way to take it off, the standards, and one of your own. */
function palette(of: Ink, now: Color | null, showing: Showing, asks: Asks): HTMLElement {
  const panel = document.createElement('div');
  const where = over(showing);
  const wear = (colour: Color | null) => {
    asks.openMenu(null);
    asks.wear({ [of.key]: colour } as StyleSays, where);
  };

  panel.append(entry(of.clears, { disabled: now === null, className: 'clears' }, () => wear(null)));

  const swatches = document.createElement('div');
  swatches.className = 'swatches';
  for (const digits of PALETTE) {
    const colour = parseColor(digits);
    if (colour === null) continue;

    const one = document.createElement('button');
    one.type = 'button';
    const here = now !== null && picked(now).toLowerCase() === `#${digits.toLowerCase()}`;
    one.className = `swatch${here ? ' here' : ''}`;
    one.title = `#${digits}`;
    one.style.background = `#${digits}`;
    one.addEventListener('click', () => wear(colour));
    swatches.append(one);
  }
  panel.append(swatches);

  const custom = document.createElement('label');
  custom.className = 'entry custom';
  custom.append('Custom\u2026');

  const pick = document.createElement('input');
  pick.type = 'color';
  pick.className = 'pick';
  pick.value = now === null ? of.opens : picked(now);
  pick.addEventListener('change', () => {
    // The picker says `#rrggbb`; a spec writes `RRGGBB` (`docs/spec.md` §6).
    wear(parseColor(pick.value.replace('#', '').toUpperCase()));
  });

  custom.append(pick);
  panel.append(custom);
  return panel;
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

/** The borders, in the one menu Sheets and Excel both keep them in: the edges, and the line they are drawn with. */
function borders(showing: Showing, asks: Asks): HTMLElement {
  const menu = {
    name: 'borders',
    title: 'Borders',
    disabled: showing.selected === null,
    marks: [marked(framed(BORDER_EDGES))],
  };

  return opens(menu, showing, asks, () => {
    const panel = document.createElement('div');
    const edges = document.createElement('div');
    edges.className = 'edges';

    for (const one of EDGES) edges.append(edge(one, showing, asks));
    panel.append(edges, lines(showing, asks));
    return panel;
  });
}

/** A border on the edges it names, with the line the toolbar is set to; these act rather than hold, so none is lit. */
function edge(of: Edge, showing: Showing, asks: Asks): HTMLElement {
  const button = document.createElement('button');

  button.type = 'button';
  button.className = `look edge ${of.name}`;
  button.title = of.says;
  button.disabled = showing.selected === null;
  button.append(marked(framed(of.sides)));
  button.addEventListener('click', () => {
    asks.openMenu(null);
    asks.wear(drawn(of, showing.line), over(showing));
  });

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
  const label = document.createElement('label');
  label.className = 'entry style';
  label.append('Line');

  const box = document.createElement('select');
  box.className = 'lines';
  box.title = 'The line a border is drawn with';

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

  label.append(box);
  return label;
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
