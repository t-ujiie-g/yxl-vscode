import type { StyleProperty, StyleSays } from '@yxl-vscode/spec';
import { STYLE_PROPERTIES } from '@yxl-vscode/spec';
import { decimalsIn, MOST_DECIMALS, withDecimals } from '@yxl-vscode/units';
import { underFormat } from './cell';
import { chosen, says } from './menus';
import type { DrawnCell } from './protocol';
import { type Asks, cellOf, over, type Showing, wornBy } from './showing';
import { chrome } from './worded';

/** The formats the box offers, the ones both spreadsheets keep at the top of theirs. */
const NUMBERS: readonly (string | null)[] = [
  null,
  '#,##0',
  '#,##0.00',
  '0.00',
  '0%',
  '0.0%',
  '¥#,##0',
  '$#,##0.00',
  'yyyy-mm-dd',
  'h:mm',
];

/** What the percent button sets, which is Excel's own answer to `Ctrl`+`Shift`+`%`. */
const PERCENT = '0%';

/** A number format, said as what it would make of the number this cell holds. */
export function numbers(showing: Showing, asks: Asks): HTMLElement {
  const of = cellOf(showing);
  const now = wornBy(showing).format ?? null;
  const where = over(showing);
  const known = NUMBERS.includes(now);

  return chosen({
    name: 'numbers',
    said:
      now === null ? chrome('view.number-format') : chrome('view.number-format-now', { code: now }),
    now: now ?? '',
    disabled: showing.selected === null,
    options: (known ? NUMBERS : [...NUMBERS, now]).map((code) => ({
      value: code ?? '',
      text: called(code, of),
      code,
    })),
    take: (value) => asks.wear({ format: value === '' ? null : value }, where),
  });
}

/** What a format is called here: what it would make of this cell's number, or the code where there is none. */
function called(code: string | null, of: DrawnCell | undefined): string {
  if (code === null) return chrome('view.general');

  return (of === undefined ? null : underFormat(of, code)) ?? code;
}

/**
 * The formats a reader reaches for without opening the box: percent, and a
 * decimal place more or fewer than the cells are showing now.
 */
export function quickly(showing: Showing, asks: Asks): HTMLElement[] {
  const now = wornBy(showing).format ?? null;
  const places = decimalsIn(now);
  const where = over(showing);
  const none = showing.selected === null;
  const set = (format: string | null) => () => asks.wear({ format }, where);

  return [
    button(
      'percent',
      '%',
      chrome('view.format-as-percent'),
      none,
      set(now === PERCENT ? null : PERCENT),
    ),
    button(
      'fewer',
      '.0←',
      chrome('view.fewer-decimals'),
      none || places === 0,
      set(withDecimals(now, places - 1)),
    ),
    button(
      'more',
      '.00→',
      chrome('view.more-decimals'),
      none || places === MOST_DECIMALS,
      set(withDecimals(now, places + 1)),
    ),
  ];
}

/** Everything the selected cells wear, taken off at once — Sheets' *clear formatting*. */
export function cleared(showing: Showing, asks: Asks): HTMLElement {
  const where = over(showing);
  const off = Object.fromEntries(
    STYLE_PROPERTIES.map((key: StyleProperty) => [key, null]),
  ) as StyleSays;

  return button('clear', 'T', chrome('view.clear-formatting'), showing.selected === null, () =>
    asks.wear(off, where),
  );
}

/** One control that acts rather than holds, so none of them is ever lit. */
function button(
  name: string,
  mark: string,
  said: string,
  disabled: boolean,
  take: () => void,
): HTMLElement {
  const one = document.createElement('button');

  one.type = 'button';
  one.className = `look ${name}`;
  one.textContent = mark;
  one.disabled = disabled;
  says(one, said);
  one.addEventListener('click', take);

  return one;
}
