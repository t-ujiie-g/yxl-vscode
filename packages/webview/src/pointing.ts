import type { Axis } from '@yxl-vscode/spec';
import { spanSaid } from '@yxl-vscode/units';
import { HELD } from './keys';
import { entry, pointedAt, says, swatches } from './menus';
import type { DrawnSheet } from './protocol';
import {
  type Asks,
  over,
  type PointedCell,
  type PointedHeading,
  type PointedTab,
  type Showing,
} from './showing';

/** The menu the reader asked for at the pointer, over whatever they pointed at. */
export function pointing(showing: Showing, asks: Asks): HTMLElement | null {
  const at = showing.pointed;
  if (at === null) return null;

  if (at.kind === 'cell') return onCell(showing, asks, at);
  if (at.kind === 'tab') return onTab(showing, asks, at);

  return onHeading(showing, asks, at);
}

/** What a cell's own menu holds: the clipboard, and clearing what the cells hold. */
function onCell(showing: Showing, asks: Asks, at: PointedCell): HTMLElement | null {
  const shut = (take: () => void) => () => {
    asks.pointAt(null);
    take();
  };
  const ours = showing.copied !== null;
  const rect = over(showing);
  const wide = rect.top !== rect.bottom || rect.left !== rect.right;
  const merged = (showing.drawing.sheets[showing.sheet]?.merges ?? []).some(
    (one) => one.top <= at.row && at.row <= one.bottom && one.left <= at.col && at.col <= one.right,
  );

  const entries = [
    ...(rect.bottom > rect.top
      ? [
          entry(
            'Sort A to Z',
            {},
            shut(() => asks.sort(false)),
          ),
          entry(
            'Sort Z to A',
            {},
            shut(() => asks.sort(true)),
          ),
        ]
      : []),
    ...(rect.bottom > rect.top
      ? [
          entry(
            'Fill down',
            { chord: `${HELD}D` },
            shut(() => asks.fill('row')),
          ),
        ]
      : []),
    ...(rect.right > rect.left
      ? [
          entry(
            'Fill right',
            { chord: `${HELD}R` },
            shut(() => asks.fill('column')),
          ),
        ]
      : []),
    ...(rect.bottom > rect.top
      ? [
          entry(
            'Make this a data table',
            {},
            shut(() => asks.table()),
          ),
        ]
      : []),
    ...(merged
      ? [
          entry(
            'Unmerge cells',
            {},
            shut(() => asks.merge(false)),
          ),
        ]
      : []),
    ...(wide && !merged
      ? [
          entry(
            'Merge cells',
            {},
            shut(() => asks.merge(true)),
          ),
        ]
      : []),
    entry(
      'Cut',
      { chord: `${HELD}X` },
      shut(() => asks.copy(at.row, at.col, true)),
    ),
    entry(
      'Copy',
      { chord: `${HELD}C` },
      shut(() => asks.copy(at.row, at.col, false)),
    ),
    pasting(
      shut(() => asks.paste(at.row, at.col)),
      ours,
    ),
    entry(
      'Clear contents',
      { chord: 'Delete' },
      shut(() => asks.empty(at.row, at.col)),
    ),
  ];

  return pointedAt(showing, asks, entries);
}

/** Paste, which only the keyboard can reach the clipboard for unless the preview copied it. */
function pasting(take: () => void, ours: boolean): HTMLElement {
  const one = entry('Paste', { chord: `${HELD}V`, disabled: !ours }, take);
  if (!ours) says(one, `Press ${HELD}V: the clipboard is the keyboard’s to give`);

  return one;
}

/** What a heading's own menu holds: hiding what is selected, showing back what is not, and the outline. */
function onHeading(showing: Showing, asks: Asks, at: PointedHeading): HTMLElement | null {
  const sheet = showing.drawing.sheets[showing.sheet];
  if (sheet === undefined) return null;

  const run = about(showing, at);
  const many = run.last - run.first + 1;
  const behind = hiddenNear(sheet, at.axis, run);

  const hide = (first: number, last: number, hidden: boolean) => () => {
    asks.pointAt(null);
    asks.hide(at.axis, first, last, hidden);
  };
  const group = (level: number) => () => {
    asks.pointAt(null);
    asks.group(at.axis, run.first, run.last, level);
  };

  const line = (where: number, by: number) => () => {
    asks.pointAt(null);
    asks.line(at.axis, where, by);
  };

  const these = many === 1 ? `${at.axis}` : `${many} ${at.axis}s`;
  const before = at.axis === 'column' ? 'left' : 'above';
  const after = at.axis === 'column' ? 'right' : 'below';

  const entries = [
    entry(`Insert ${these} ${before}`, {}, line(run.first, many)),
    entry(`Insert ${these} ${after}`, {}, line(run.last + 1, many)),
    entry(`Delete ${many === 1 ? `this ${at.axis}` : these}`, {}, line(run.first, -many)),
    entry(
      many === 1 ? `Hide this ${at.axis}` : `Hide these ${many} ${at.axis}s`,
      {},
      hide(run.first, run.last, true),
    ),
    ...(behind === null
      ? []
      : [
          entry(
            `Show ${spanSaid(at.axis, behind.first, behind.last)} again`,
            {},
            hide(behind.first, behind.last, false),
          ),
        ]),
    entry(many === 1 ? `Group this ${at.axis}` : `Group these ${many} ${at.axis}s`, {}, group(1)),
    ...(grouping(sheet, at.axis, run) ? [entry('Take out of the outline', {}, group(0))] : []),
  ];

  return pointedAt(showing, asks, entries);
}

/** What a menu on a heading is about: the run the reader had selected, where this heading is in it. */
function about(showing: Showing, at: PointedHeading): { first: number; last: number } {
  const { selected, anchor } = showing;
  if (selected === null || anchor === null) return { first: at.at, last: at.at };

  const one = at.axis === 'column' ? selected.col : selected.row;
  const than = at.axis === 'column' ? anchor.col : anchor.row;
  const run = { first: Math.min(one, than), last: Math.max(one, than) };

  return at.at >= run.first && at.at <= run.last ? run : { first: at.at, last: at.at };
}

/** Whether anything already puts what the menu is about into an outline. */
function grouping(sheet: DrawnSheet, axis: Axis, run: { first: number; last: number }): boolean {
  const runs = axis === 'column' ? sheet.widths : sheet.heights;
  return runs.some((one) => (one.group ?? 0) > 0 && one.first <= run.last && one.last >= run.first);
}

/** The run hidden either side of what the menu is about, which is what there is to show again. */
function hiddenNear(
  sheet: DrawnSheet,
  axis: Axis,
  run: { first: number; last: number },
): { first: number; last: number } | null {
  const runs = axis === 'column' ? sheet.widths : sheet.heights;
  const hides = runs.filter(
    (one) => one.hidden && one.last >= run.first - 1 && one.first <= run.last + 1,
  );
  const first = Math.min(...hides.map((one) => one.first));
  const last = Math.max(...hides.map((one) => one.last));

  return hides.length === 0 ? null : { first, last };
}

/** What a tab's own menu holds: what there is no room for on the tab itself. */
function onTab(showing: Showing, asks: Asks, at: PointedTab): HTMLElement | null {
  const sheet = showing.drawing.sheets[at.sheet];
  if (sheet === undefined) return null;

  const shut = (take: () => void) => () => {
    asks.pointAt(null);
    take();
  };
  const buried = sheet.visibility === 'very_hidden';
  const hidden = sheet.visibility !== 'visible';

  const entries = [
    entry(
      'Rename',
      { disabled: buried },
      shut(() => asks.nameSheet(at.sheet)),
    ),
    entry(
      'Delete',
      { disabled: buried },
      shut(() => asks.deleteSheet(sheet.name)),
    ),
    entry(
      hidden ? 'Unhide' : 'Hide',
      { disabled: buried },
      shut(() => asks.setTab(sheet.name, { visibility: hidden ? 'visible' : 'hidden' })),
    ),
    entry(
      'Gridlines',
      { disabled: buried, checked: sheet.gridlines },
      shut(() => asks.setTab(sheet.name, { gridlines: !sheet.gridlines })),
    ),
  ];

  const panel = pointedAt(showing, asks, entries);
  if (panel === null || buried) return panel;

  const colours = document.createElement('div');
  colours.className = 'entry tabbed';
  colours.append('Tab colour');
  colours.append(
    ...swatches(sheet.tabColor, '#4A86E8', (digits) => {
      asks.pointAt(null);
      asks.setTab(sheet.name, { color: digits });
    }),
  );

  const clears = entry(
    'No tab colour',
    { disabled: sheet.tabColor === null, className: 'clears' },
    shut(() => asks.setTab(sheet.name, { color: null })),
  );

  panel.querySelector('.panel')?.append(clears, colours);
  return panel;
}
