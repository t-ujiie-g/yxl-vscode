import type { Axis } from '@yxl-vscode/spec';
import { HELD } from './keys';
import { entry, pointedAt, says, swatches } from './menus';
import type { DrawnCell, DrawnSheet } from './protocol';
import {
  type Asks,
  over,
  type PointedCell,
  type PointedHeading,
  type PointedTab,
  type Showing,
} from './showing';
import { chrome, spanned } from './worded';

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
            chrome('view.sort-a-to-z'),
            {},
            shut(() => asks.sort(false)),
          ),
          entry(
            chrome('view.sort-z-to-a'),
            {},
            shut(() => asks.sort(true)),
          ),
        ]
      : []),
    ...(rect.bottom > rect.top
      ? [
          entry(
            chrome('view.fill-down'),
            { chord: `${HELD}D` },
            shut(() => asks.fill('row')),
          ),
        ]
      : []),
    ...(rect.right > rect.left
      ? [
          entry(
            chrome('view.fill-right'),
            { chord: `${HELD}R` },
            shut(() => asks.fill('column')),
          ),
        ]
      : []),
    ...(rect.bottom > rect.top
      ? [
          entry(
            chrome('view.make-a-data-table'),
            {},
            shut(() => asks.table()),
          ),
        ]
      : []),
    ...(merged
      ? [
          entry(
            chrome('view.unmerge-cells'),
            {},
            shut(() => asks.merge(false)),
          ),
        ]
      : []),
    ...(wide && !merged
      ? [
          entry(
            chrome('view.merge-cells'),
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
      chrome('view.clear-contents'),
      { chord: chrome('view.delete') },
      shut(() => asks.empty(at.row, at.col)),
    ),
    ...noting(showing, asks, at, shut),
    ...linking(showing, asks, at, shut),
    ...validating(showing, asks, at, shut),
    ...tabling(showing, asks, at, shut),
    ...(showing.drawing.sheets[showing.sheet]?.filter === null
      ? [
          entry(
            chrome('view.create-a-filter'),
            {},
            shut(() => asks.filter(true)),
          ),
        ]
      : [
          entry(
            chrome('view.remove-filter'),
            {},
            shut(() => asks.filter(false)),
          ),
        ]),
    ...(rect.right > rect.left
      ? [
          entry(
            chrome('view.insert-a-chart'),
            {},
            shut(() => asks.chart()),
          ),
        ]
      : []),
    entry(
      chrome('view.insert-an-image'),
      {},
      shut(() => asks.image(at.row, at.col)),
    ),
  ];

  return pointedAt(showing, asks, entries);
}

/** What a cell's note is worth offering: writing one, or changing and taking off the one it carries. */
function noting(
  showing: Showing,
  asks: Asks,
  at: PointedCell,
  shut: (take: () => void) => () => void,
): HTMLElement[] {
  const ask = shut(() => asks.askAt({ at: { row: at.row, col: at.col }, what: 'note' }));
  if ((cellAt(showing, at)?.note ?? null) === null)
    return [entry(chrome('view.insert-note'), {}, ask)];

  return [
    entry(chrome('view.edit-note'), {}, ask),
    entry(
      chrome('view.delete-note'),
      {},
      shut(() => asks.note(at.row, at.col, null)),
    ),
  ];
}

/** What a cell's link is worth offering; which kind of target it is, is the reader's to say (`docs/spec.md` §10). */
function linking(
  showing: Showing,
  asks: Asks,
  at: PointedCell,
  shut: (take: () => void) => () => void,
): HTMLElement[] {
  const ask = (what: 'url' | 'to') =>
    shut(() => asks.askAt({ at: { row: at.row, col: at.col }, what }));

  const link = cellAt(showing, at)?.link ?? null;
  if (link === null) {
    return [
      entry(chrome('view.link-to-a-page'), {}, ask('url')),
      entry(chrome('view.link-to-a-cell'), {}, ask('to')),
    ];
  }

  return [
    entry(chrome('view.edit-link'), {}, ask(link.kind)),
    entry(
      chrome('view.remove-link'),
      {},
      shut(() => asks.link(at.row, at.col, null)),
    ),
  ];
}

/** What a cell's validation is worth offering; a `list:` is the kind a reader makes by hand. */
function validating(
  showing: Showing,
  asks: Asks,
  at: PointedCell,
  shut: (take: () => void) => () => void,
): HTMLElement[] {
  if ((cellAt(showing, at)?.validation ?? null) === null) {
    return [
      entry(
        chrome('view.data-validation'),
        {},
        shut(() => asks.askAt({ at: { row: at.row, col: at.col }, what: 'list' })),
      ),
    ];
  }

  return [
    entry(
      chrome('view.remove-validation'),
      {},
      shut(() => asks.validate(null)),
    ),
  ];
}

/** What a table is worth offering over the selection: making one, or taking off the one the cell is in. */
function tabling(
  showing: Showing,
  asks: Asks,
  at: PointedCell,
  shut: (take: () => void) => () => void,
): HTMLElement[] {
  const tables = showing.drawing.sheets[showing.sheet]?.tables ?? [];
  const inside = tables.some(
    (one) => at.row >= one.top && at.row <= one.bottom && at.col >= one.left && at.col <= one.right,
  );

  if (inside) {
    return [
      entry(
        chrome('view.remove-table'),
        {},
        shut(() => asks.formatTable(false)),
      ),
    ];
  }

  return [
    entry(
      chrome('view.format-as-table'),
      {},
      shut(() => asks.formatTable(true)),
    ),
  ];
}

/** The cell a menu was asked for on, as the drawing has it. */
function cellAt(showing: Showing, at: PointedCell): DrawnCell | undefined {
  const cells = showing.drawing.sheets[showing.sheet]?.cells ?? [];
  return cells.find((one) => one.row === at.row && one.col === at.col);
}

/** Paste, which only the keyboard can reach the clipboard for unless the preview copied it. */
function pasting(take: () => void, ours: boolean): HTMLElement {
  const one = entry(chrome('view.paste'), { chord: `${HELD}V`, disabled: !ours }, take);
  if (!ours) says(one, chrome('view.paste-is-the-keyboards', { chord: `${HELD}V` }));

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

  const bands = { many, axis: at.axis };

  const entries = [
    entry(chrome('view.insert-before', bands), {}, line(run.first, many)),
    entry(chrome('view.insert-after', bands), {}, line(run.last + 1, many)),
    entry(chrome('view.delete-bands', bands), {}, line(run.first, -many)),
    entry(chrome('view.hide-bands', bands), {}, hide(run.first, run.last, true)),
    ...(behind === null
      ? []
      : [
          entry(
            chrome('view.show-again', { span: spanned(at.axis, behind.first, behind.last) }),
            {},
            hide(behind.first, behind.last, false),
          ),
        ]),
    entry(chrome('view.group-bands', bands), {}, group(1)),
    ...(grouping(sheet, at.axis, run)
      ? [entry(chrome('view.take-out-of-the-outline'), {}, group(0))]
      : []),
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
      chrome('view.rename'),
      { disabled: buried },
      shut(() => asks.nameSheet(at.sheet)),
    ),
    entry(
      chrome('view.delete'),
      { disabled: buried },
      shut(() => asks.deleteSheet(sheet.name)),
    ),
    entry(
      hidden ? chrome('view.unhide') : chrome('view.hide'),
      { disabled: buried },
      shut(() => asks.setTab(sheet.name, { visibility: hidden ? 'visible' : 'hidden' })),
    ),
    entry(
      chrome('view.gridlines'),
      { disabled: buried, checked: sheet.gridlines },
      shut(() => asks.setTab(sheet.name, { gridlines: !sheet.gridlines })),
    ),
  ];

  const panel = pointedAt(showing, asks, entries);
  if (panel === null || buried) return panel;

  const colours = document.createElement('div');
  colours.className = 'entry tabbed';
  colours.append(chrome('view.tab-colour'));
  colours.append(
    ...swatches(sheet.tabColor, '#4A86E8', (digits) => {
      asks.pointAt(null);
      asks.setTab(sheet.name, { color: digits });
    }),
  );

  const clears = entry(
    chrome('view.no-tab-colour'),
    { disabled: sheet.tabColor === null, className: 'clears' },
    shut(() => asks.setTab(sheet.name, { color: null })),
  );

  panel.querySelector('.panel')?.append(clears, colours);
  return panel;
}
