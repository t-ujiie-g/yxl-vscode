import type { Axis } from '@yxl-vscode/spec';
import { spanSaid } from '@yxl-vscode/units';
import { HELD } from './keys';
import { entry, pointedAt, says } from './menus';
import type { DrawnSheet } from './protocol';
import type { Asks, PointedCell, PointedHeading, Showing } from './showing';

/** The menu the reader asked for at the pointer, over whatever they pointed at. */
export function pointing(showing: Showing, asks: Asks): HTMLElement | null {
  const at = showing.pointed;
  if (at === null) return null;

  return at.kind === 'cell' ? onCell(showing, asks, at) : onHeading(showing, asks, at);
}

/** What a cell's own menu holds: the clipboard, and clearing what the cells hold. */
function onCell(showing: Showing, asks: Asks, at: PointedCell): HTMLElement | null {
  const shut = (take: () => void) => () => {
    asks.pointAt(null);
    take();
  };
  const ours = showing.copied !== null;

  const entries = [
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
