import {
  BORDER_EDGES,
  BORDER_STYLES,
  type BorderEdgeName,
  type BorderStyle,
  type HAlign,
  type StyleProperty,
  type StyleSays,
  type VAlign,
} from '@yxl-vscode/spec';
import { addrAt, type Color, painted, parseColor } from '@yxl-vscode/units';
import { faces, sizes } from './fonts';
import { cleared, numbers, quickly } from './formats';
import { HELD } from './keys';
import { ACROSS, type Bar, DOWN, framed, frozen, marked, RAGGED } from './marks';
import { entry, opens, says, swatches } from './menus';
import { type Asks, over, type Showing, wornBy } from './showing';
import type { Says } from './text';
import { chrome } from './worded';

/** What a reader reaches for first: the look of the cells they have selected, and where the sheet is frozen. */
export function toolbar(showing: Showing, asks: Asks): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'toolbar';

  bar.append(faces(showing, asks), sizes(showing, asks));
  bar.append(divider());
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
  bar.append(numbers(showing, asks), ...quickly(showing, asks));
  bar.append(divider());
  bar.append(borders(showing, asks));
  bar.append(panes(showing, asks));
  bar.append(divider());
  bar.append(cleared(showing, asks));

  return bar;
}

/** Where the sheet's panes are frozen, as the menu every spreadsheet keeps it in. */
function panes(showing: Showing, asks: Asks): HTMLElement {
  const at = showing.selected;
  const stays = showing.drawing.sheets[showing.sheet]?.freeze ?? null;

  return opens(
    {
      name: 'freeze',
      title: chrome('view.freeze-panes'),
      disabled: false,
      marks: [marked(frozen())],
    },
    showing,
    asks,
    () => {
      const panel = document.createElement('div');
      const upTo = at === null ? chrome('view.the-selected-cell') : addrAt(at);
      const taken = (to: typeof at) => {
        asks.openMenu(null);
        asks.freeze(to);
      };

      panel.append(
        entry(
          chrome('view.freeze-up-to', { at: upTo }),
          { disabled: at === null || (at.row === 1 && at.col === 1) },
          () => taken(at),
        ),
        entry(chrome('view.no-frozen-panes'), { disabled: stays === null }, () => taken(null)),
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

interface Toggle {
  readonly key: StyleProperty;
  readonly name: string;
  readonly mark: string;
  readonly says: keyof Says;
  readonly chord?: string;
}

const TOGGLES: readonly Toggle[] = [
  { key: 'font.bold', name: 'bold', mark: 'B', says: 'view.bold', chord: `${HELD}B` },
  { key: 'font.italic', name: 'italic', mark: 'I', says: 'view.italic', chord: `${HELD}I` },
  {
    key: 'font.underline',
    name: 'underline',
    mark: 'U',
    says: 'view.underline',
    chord: `${HELD}U`,
  },
  { key: 'font.strike', name: 'strike', mark: 'S', says: 'view.strikethrough' },
];

const WRAP: Toggle = { key: 'align.wrap', name: 'wrap', mark: '\u21b5', says: 'view.wrap-text' };

/** One switch, showing what the selected cell wears and asking for the other of it. */
function toggle(of: Toggle, showing: Showing, asks: Asks): HTMLElement {
  const on = wornBy(showing)[of.key] === true;
  const button = document.createElement('button');

  button.type = 'button';
  button.className = `look ${of.name}${on ? ' on' : ''}`;
  button.textContent = of.mark;
  const said = chrome(of.says);
  says(button, of.chord === undefined ? said : `${said} (${of.chord})`);
  button.disabled = showing.selected === null;
  button.setAttribute('aria-pressed', on ? 'true' : 'false');
  button.addEventListener('click', () => asks.wear({ [of.key]: !on } as StyleSays, over(showing)));

  return button;
}

interface Ink {
  readonly key: 'font.color' | 'fill';
  readonly name: string;
  readonly mark: string;
  readonly says: keyof Says;
  readonly clears: keyof Says;
  readonly opens: string;
}

const INKS: readonly Ink[] = [
  {
    key: 'font.color',
    name: 'ink',
    mark: 'A',
    says: 'view.text-colour',
    clears: 'view.automatic-text-colour',
    opens: '#000000',
  },
  {
    key: 'fill',
    name: 'fill',
    mark: '■',
    says: 'view.fill',
    clears: 'view.no-fill',
    opens: '#ffffff',
  },
];

/** A colour, as the swatch the selected cell wears over the palette that sets it. */
function ink(of: Ink, showing: Showing, asks: Asks): HTMLElement {
  const now = wornBy(showing)[of.key] ?? null;

  const mark = document.createElement('span');
  mark.className = 'letter';
  mark.textContent = of.mark;
  mark.style.setProperty('border-bottom-color', now === null ? 'transparent' : painted(now));

  const menu = {
    name: of.name,
    title: chrome(of.says),
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

  panel.append(
    entry(chrome(of.clears), { disabled: now === null, className: 'clears' }, () => wear(null)),
  );
  panel.append(
    ...swatches(now === null ? null : painted(now).slice(1), of.opens, (digits) =>
      wear(parseColor(digits)),
    ),
  );

  return panel;
}

/** One place the text can sit; pressing the one that already holds takes it off (ADR-039). */
interface Pick {
  readonly key: 'align.horizontal' | 'align.vertical';
  readonly value: HAlign | VAlign;
  readonly name: string;
  readonly says: keyof Says;
  readonly bars: readonly Bar[];
}

const PICKS: readonly Pick[] = [
  {
    key: 'align.horizontal',
    value: 'left',
    name: 'left',
    says: 'view.align-left',
    bars: ACROSS.map((y, row) => ({ x: 2, y, width: RAGGED[row] ?? 12 })),
  },
  {
    key: 'align.horizontal',
    value: 'center',
    name: 'centre',
    says: 'view.align-centre',
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
    says: 'view.align-right',
    bars: ACROSS.map((y, row) => ({ x: 14 - (RAGGED[row] ?? 12), y, width: RAGGED[row] ?? 12 })),
  },
  {
    key: 'align.vertical',
    value: 'top',
    name: 'top',
    says: 'view.align-top',
    bars: DOWN.map((y) => ({ x: 3, y: y + 2, width: 10 })),
  },
  {
    key: 'align.vertical',
    value: 'middle',
    name: 'middle',
    says: 'view.align-middle',
    bars: DOWN.map((y) => ({ x: 3, y: y + 4.2, width: 10 })),
  },
  {
    key: 'align.vertical',
    value: 'bottom',
    name: 'bottom',
    says: 'view.align-bottom',
    bars: DOWN.map((y) => ({ x: 3, y: y + 6.4, width: 10 })),
  },
];

/** A colour as the picker takes one: six digits behind a `#`, an eight-digit form's alpha dropped. */

/** One of a group, showing where the text sits and asking for it there — or, where it already is, nowhere. */
function pick(of: Pick, showing: Showing, asks: Asks): HTMLElement {
  const on = wornBy(showing)[of.key] === of.value;
  const button = document.createElement('button');

  button.type = 'button';
  button.className = `look ${of.name}${on ? ' on' : ''}`;
  says(button, chrome(of.says));
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
  readonly says: keyof Says;
  readonly sides: readonly BorderEdgeName[];
}

const EDGES: readonly Edge[] = [
  { name: 'all', says: 'view.all-borders', sides: BORDER_EDGES },
  { name: 'top', says: 'view.top-border', sides: ['top'] },
  { name: 'bottom', says: 'view.bottom-border', sides: ['bottom'] },
  { name: 'left', says: 'view.left-border', sides: ['left'] },
  { name: 'right', says: 'view.right-border', sides: ['right'] },
  { name: 'none', says: 'view.no-borders', sides: [] },
];

/** The borders, in the one menu Sheets and Excel both keep them in: the edges, and the line they are drawn with. */
function borders(showing: Showing, asks: Asks): HTMLElement {
  const menu = {
    name: 'borders',
    title: chrome('view.borders'),
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
  says(button, chrome(of.says));
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
  box.title = chrome('view.border-line');

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
