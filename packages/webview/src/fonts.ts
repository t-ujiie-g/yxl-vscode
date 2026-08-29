import { chosen } from './menus';
import { type Asks, over, type Showing, wornBy } from './showing';
import { chrome } from './worded';

/** A list rather than the machine's fonts: a face a spec names is one Excel goes looking for. */
const FACES: readonly string[] = [
  'Arial',
  'BIZ UDPゴシック',
  'Calibri',
  'Courier New',
  'Georgia',
  'Meiryo',
  'MS PGothic',
  'Times New Roman',
  'Verdana',
  'Yu Gothic',
  'Yu Mincho',
];

/** The sizes a spreadsheet offers, in points, as Excel's own list has them. */
const SIZES: readonly number[] = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];

/** The face the selected cells are set in, or the workbook's own where they name none. */
export function faces(showing: Showing, asks: Asks): HTMLElement {
  const now = wornBy(showing)['font.name'] ?? null;
  const where = over(showing);

  return chosen({
    name: 'face',
    said: chrome('view.font'),
    now: now ?? '',
    disabled: showing.selected === null,
    options: [
      { value: '', text: chrome('view.default-font') },
      ...held(FACES, now).map((one) => ({ value: one, text: one })),
    ],
    take: (value) => asks.wear({ 'font.name': value === '' ? null : value }, where),
  });
}

/** The size the selected cells are set in, in points. */
export function sizes(showing: Showing, asks: Asks): HTMLElement {
  const now = wornBy(showing)['font.size'] ?? null;
  const where = over(showing);

  return chosen({
    name: 'size',
    said: chrome('view.font-size'),
    now: now === null ? '' : String(now),
    disabled: showing.selected === null,
    options: [
      { value: '', text: '—' },
      ...held(SIZES, now).map((one) => ({ value: String(one), text: String(one) })),
    ],
    take: (value) => asks.wear({ 'font.size': value === '' ? null : Number(value) }, where),
  });
}

/** The offered list with what the cell wears, where a spec named something else. */
function held<T>(offered: readonly T[], now: T | null): readonly T[] {
  if (now === null || offered.includes(now)) return offered;

  return [...offered, now];
}
