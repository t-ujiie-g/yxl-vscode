// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { draw, restate } from './draw';
import { asks, at, cell, drawing, scrolled, sheet, showingOf, shown } from './harness';
import type { DrawnCell, DrawnSheet, DrawnTable } from './protocol';
import type { Asks, Showing } from './showing';
import { pinned } from './table';
import { widthOf } from './window';

describe('the grid', () => {
  it('draws a heading row of column names, and a number down the side', () => {
    const into = shown();
    const headings = [...into.querySelectorAll('thead th')].map((one) => one.textContent);
    const numbers = [...into.querySelectorAll('tbody th')].map((one) => one.textContent);

    expect(headings).toEqual(['', 'A', 'B']);
    expect(numbers).toEqual(['1', '2']);
  });
});

describe('a merge', () => {
  const merged = sheet({
    rows: 2,
    columns: 3,
    merges: [{ top: 1, left: 1, bottom: 1, right: 3 }],
    cells: [cell(1, 1, { value: 'wide' })],
  });

  it('spans the region from its top-left cell', () => {
    const drawn = at(shown({ drawing: drawing({ sheets: [merged] }) }), 1, 1);
    expect([drawn?.colSpan, drawn?.rowSpan]).toEqual([3, 1]);
  });

  it('draws nothing for the cells it swallows, which would push the row along', () => {
    const into = shown({ drawing: drawing({ sheets: [merged] }) });
    expect([...(into.querySelectorAll('tbody tr')[0]?.querySelectorAll('td') ?? [])]).toHaveLength(
      1,
    );
  });
});

describe('a sheet larger than the window drawn of it', () => {
  const tall = sheet({
    rows: 2,
    columns: 2,
    at: { row: 51, col: 1 },
    of: { rows: 100, columns: 2 },
  });

  it('draws the rows of the window it was given and no others', () => {
    const into = shown({ drawing: drawing({ sheets: [tall] }) });
    const numbers = [...into.querySelectorAll('tbody th')].map((one) => one.textContent);

    expect(numbers).toEqual(['51', '52']);
  });

  it('holds the rows above and below open, so the scrollbar says how much sheet there is', () => {
    const into = shown({ drawing: drawing({ sheets: [tall] }) });
    const gaps = [...into.querySelectorAll<HTMLElement>('tbody .gap')].map(
      (one) => one.style.height,
    );

    // 50 rows of 20px above, and the 48 the window leaves below it.
    expect(gaps).toEqual(['1000px', '960px']);
  });

  it('holds the columns to the left and right open in the same way', () => {
    const wide = sheet({ at: { row: 1, col: 3 }, of: { rows: 2, columns: 10 } });
    const into = shown({ drawing: drawing({ sheets: [wide] }) });
    const pads = [...into.querySelectorAll<HTMLElement>('thead .pad')].map((one) =>
      Number.parseFloat(one.style.width),
    );

    // Two default columns to the left of the window, six to the right of it.
    expect(pads[0]).toBeCloseTo(2 * 59.01, 2);
    expect(pads[1]).toBeCloseTo(6 * 59.01, 2);
  });

  it('asks for the window the reader has scrolled to', () => {
    const on = asks();
    const into = shown({ drawing: drawing({ sheets: [tall] }) }, on);

    const box = into.querySelector('.scroller');
    if (!(box instanceof HTMLElement)) throw new Error('no scroller');

    box.scrollTop = 20 * 89;
    box.dispatchEvent(new Event('scroll'));
    expect(on.showWindow).toHaveBeenCalledWith(89, 1);
  });

  it('asks for nothing while what is drawn covers where the reader is', () => {
    const on = asks();
    const covering = sheet({ rows: 100, columns: 2, of: { rows: 100, columns: 2 } });
    const into = shown({ drawing: drawing({ sheets: [covering] }) }, on);

    into.querySelector('.scroller')?.dispatchEvent(new Event('scroll'));
    expect(on.showWindow).not.toHaveBeenCalled();
  });

  it('stays where the reader left it when a new window is drawn', () => {
    const into = document.createElement('div');
    const on = asks();
    const showing = (of: DrawnSheet): Showing => ({
      drawing: drawing({ sheets: [of] }),
      sheet: 0,
      selected: null,
      anchor: null,
      sources: null,
      reached: null,
      refused: null,
      said: null,
      copied: null,
      looking: null,
      editable: null,
      line: 'thin',
      menu: null,
      pointed: null,
      naming: null,
      asking: null,
      comes: null,
    });

    draw(into, showing(tall), on);
    scrolled(into, 1400);

    draw(into, showing(sheet({ ...tall, at: { row: 61, col: 1 } })), on);
    expect(into.querySelector<HTMLElement>('.scroller')?.scrollTop).toBe(1400);
  });

  it('starts at the top of another sheet, which was never scrolled', () => {
    const into = document.createElement('div');
    const on = asks();
    const two = drawing({ sheets: [tall, sheet({ name: 'Notes' })] });
    const showing = (index: number): Showing => ({
      drawing: two,
      sheet: index,
      selected: null,
      anchor: null,
      sources: null,
      reached: null,
      refused: null,
      said: null,
      copied: null,
      looking: null,
      editable: null,
      line: 'thin',
      menu: null,
      pointed: null,
      naming: null,
      asking: null,
      comes: null,
    });

    draw(into, showing(0), on);
    scrolled(into, 1400);

    draw(into, showing(1), on);
    expect(into.querySelector<HTMLElement>('.scroller')?.scrollTop).toBe(0);
  });
});

describe('a sheet with frozen panes', () => {
  const frozen = sheet({
    rows: 2,
    columns: 2,
    at: { row: 51, col: 1 },
    of: { rows: 100, columns: 2 },
    freeze: { row: 3, col: 1 },
  });

  it('draws the frozen rows above the window, wherever the window is', () => {
    const into = shown({ drawing: drawing({ sheets: [frozen] }) });
    expect([...into.querySelectorAll('tbody th')].map((one) => one.textContent)).toEqual([
      '1',
      '2',
      '51',
      '52',
    ]);
  });

  it('takes their height out of the gap, so the sheet is as tall as it was', () => {
    const into = shown({ drawing: drawing({ sheets: [frozen] }) });
    const gaps = [...into.querySelectorAll<HTMLElement>('tbody .gap')].map(
      (one) => one.style.height,
    );

    // The 48 rows between the frozen two and the window, and the 48 below it.
    expect(gaps).toEqual(['960px', '960px']);
  });

  it('keeps each frozen row under the headings, at the height it was drawn at', () => {
    const into = shown({ drawing: drawing({ sheets: [frozen] }) });
    const rows = [...into.querySelectorAll<HTMLElement>('tr.frozen')];

    expect(rows.map((one) => one.querySelector<HTMLElement>('td')?.style.top)).toEqual([
      '24px',
      '44px',
    ]);
  });

  it('leaves the declared pinning alone where there is no layout to measure', () => {
    // jsdom lays nothing out, which is the same shape as a panel not yet shown:
    // the declared heights are all there is, and they are better than zero.
    const into = shown({ drawing: drawing({ sheets: [frozen] }) });
    pinned(into);

    expect(
      [...into.querySelectorAll<HTMLElement>('tr.frozen')].map(
        (one) => one.querySelector<HTMLElement>('td')?.style.top,
      ),
    ).toEqual(['24px', '44px']);
  });

  it('keeps the frozen columns right of the row numbers', () => {
    const sideways = sheet({
      at: { row: 1, col: 3 },
      of: { rows: 2, columns: 10 },
      freeze: { row: 1, col: 2 },
      visibility: 'visible',
      tabColor: null,
      gridlines: true,
      split: null,
    });
    const into = shown({ drawing: drawing({ sheets: [sideways] }) });
    const headings = [...into.querySelectorAll<HTMLElement>('thead th.stays')];

    expect(headings.map((one) => [one.textContent, one.style.left])).toEqual([['A', '44px']]);
  });

  it('holds nothing where the sheet freezes nothing', () => {
    const into = shown({ drawing: drawing({ sheets: [sheet()] }) });
    expect(into.querySelectorAll('.stays')).toHaveLength(0);
  });
});

describe('a heading a reader clicks', () => {
  const wide = sheet({ rows: 2, columns: 2, of: { rows: 40, columns: 6 } });

  it('asks for the whole column, and for the whole row from the numbers', () => {
    const on = asks();
    const into = shown({ drawing: drawing({ sheets: [wide] }) }, on);

    into
      .querySelector<HTMLElement>('thead th[data-col="2"]')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(on.takeBand).toHaveBeenCalledWith('column', 2, false);

    into
      .querySelector<HTMLElement>('tbody th[data-row="1"]')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(on.takeBand).toHaveBeenCalledWith('row', 1, false);
  });

  it('reaches rather than takes where `Shift` is down, or the pointer is dragged over it', () => {
    const on = asks();
    const into = shown({ drawing: drawing({ sheets: [wide] }) }, on);
    const heading = into.querySelector<HTMLElement>('thead th[data-col="1"]');

    heading?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: true }));
    expect(on.takeBand).toHaveBeenCalledWith('column', 1, true);

    heading?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, buttons: 1 }));
    expect(on.dragBand).toHaveBeenCalledWith('column', 1);
  });

  it('sizes rather than selects where the grip is what was pressed', () => {
    const on = asks();
    const into = shown({ drawing: drawing({ sheets: [wide] }) }, on);

    into
      .querySelector<HTMLElement>('thead th[data-col="1"] .grip')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(on.takeBand).not.toHaveBeenCalled();
  });

  it('asks for the whole sheet from the corner, which is the button that lives there', () => {
    const on = asks();
    const into = shown({ drawing: drawing({ sheets: [wide] }) }, on);

    into.querySelector<HTMLButtonElement>('.corner .all')?.click();
    expect(on.takeAll).toHaveBeenCalled();
  });

  it('marks the heading a hidden run sits behind, and shows it again when the mark is pressed', () => {
    const on = asks();
    const hides = sheet({
      rows: 2,
      columns: 4,
      of: { rows: 40, columns: 4 },
      widths: [{ first: 2, last: 3, size: null, hidden: true, group: null }],
    });
    const into = shown({ drawing: drawing({ sheets: [hides] }) }, on);
    const marks = [...into.querySelectorAll<HTMLElement>('thead .hiding')];

    expect(marks).toHaveLength(1);
    expect(marks[0]?.title).toBe('Show columns B-C again');

    marks[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(on.hide).toHaveBeenCalledWith('column', 2, 3, false);
  });

  it('marks it beside a frozen band, where the empty pad used to break the run', () => {
    // `freeze: B3` freezes column A and leaves a pad of no width behind it; the
    // hidden B sits in that seam, which is where the mark went missing.
    const on = asks();
    const frozen = sheet({
      rows: 2,
      columns: 4,
      of: { rows: 40, columns: 4 },
      freeze: { row: 3, col: 2 },
      visibility: 'visible',
      tabColor: null,
      gridlines: true,
      split: null,
      widths: [{ first: 2, last: 2, size: null, hidden: true, group: null }],
    });
    const into = shown({ drawing: drawing({ sheets: [frozen] }) }, on);

    const mark = into.querySelector<HTMLElement>('thead .hiding');
    expect(mark?.title).toBe('Show column B again');

    mark?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(on.hide).toHaveBeenCalledWith('column', 2, 2, false);
  });

  it('draws the outline a group puts on the headings, one bar per level it is in', () => {
    const on = asks();
    const outlined = sheet({
      rows: 2,
      columns: 8,
      of: { rows: 40, columns: 8 },
      widths: [
        { first: 2, last: 6, size: null, hidden: false, group: 1 },
        { first: 3, last: 5, size: null, hidden: false, group: 2 },
      ],
    });
    const into = shown({ drawing: drawing({ sheets: [outlined] }) }, on);

    // One gutter row per level, above the headings and aligned with them.
    const rows = [...into.querySelectorAll<HTMLElement>('thead tr.outline.column')];
    expect(rows).toHaveLength(2);

    // Five columns in the outer run, three in the inner one.
    expect(rows[0]?.querySelectorAll('.outline.in')).toHaveLength(5);
    expect(rows[1]?.querySelectorAll('.outline.in')).toHaveLength(3);

    const controls = [...into.querySelectorAll<HTMLButtonElement>('thead .grouping.control')];
    expect(controls.map((one) => one.title)).toEqual([
      'Collapse columns B-F',
      'Collapse columns C-E',
    ]);

    controls[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(on.hide).toHaveBeenCalledWith('column', 2, 6, true);
  });

  it('puts the way back on the heading a collapsed group sits behind', () => {
    const on = asks();
    const collapsed = sheet({
      rows: 2,
      columns: 5,
      of: { rows: 40, columns: 5 },
      widths: [{ first: 2, last: 3, size: null, hidden: true, group: 1 }],
    });
    const into = shown({ drawing: drawing({ sheets: [collapsed] }) }, on);

    // The group's own control, rather than the plain mark a hidden run leaves —
    // and in the gutter at the seam, not on the heading (ADR-045).
    expect(into.querySelectorAll('thead .hiding')).toHaveLength(0);
    expect(into.querySelectorAll('thead th .grouping.control')).toHaveLength(0);

    const control = into.querySelector<HTMLButtonElement>(
      'thead .outline.opening .grouping.control',
    );
    expect([control?.textContent, control?.title]).toEqual(['+', 'Open columns B-C']);

    control?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(on.hide).toHaveBeenCalledWith('column', 2, 3, false);
  });

  it('keeps the run selected when the menu is asked for inside it', () => {
    const on = asks();
    const into = shown(
      {
        drawing: drawing({ sheets: [wide] }),
        selected: { row: 1, col: 1 },
        anchor: { row: 40, col: 2 },
      },
      on,
    );
    const at = into.querySelector<HTMLElement>('thead th[data-col="2"]');

    // The right button never takes a heading: `mousedown` fires for it too, and
    // taking the one under it would throw away the run the menu is for.
    at?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    at?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    expect(on.takeBand).not.toHaveBeenCalled();
    expect(on.pointAt).toHaveBeenCalledWith({ kind: 'heading', axis: 'column', at: 2, x: 0, y: 0 });
  });

  it('asks for a menu on the heading, leaving what it is about to the view', () => {
    const on = asks();
    const into = shown(
      {
        drawing: drawing({ sheets: [wide] }),
        selected: { row: 1, col: 1 },
        anchor: { row: 40, col: 1 },
      },
      on,
    );

    into
      .querySelector<HTMLElement>('thead th[data-col="2"]')
      ?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    expect(on.takeBand).not.toHaveBeenCalled();
    expect(on.pointAt).toHaveBeenCalledWith({ kind: 'heading', axis: 'column', at: 2, x: 0, y: 0 });
  });

  it('opens a menu on a heading, which hides what the reader has selected', () => {
    const on = asks();
    const into = shown({ drawing: drawing({ sheets: [wide] }) }, on);

    into
      .querySelector<HTMLElement>('thead th[data-col="2"]')
      ?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(on.pointAt).toHaveBeenCalledWith({ kind: 'heading', axis: 'column', at: 2, x: 0, y: 0 });

    const menu = shown(
      {
        drawing: drawing({ sheets: [wide] }),
        selected: { row: 1, col: 2 },
        anchor: { row: 40, col: 3 },
        pointed: { kind: 'heading', axis: 'column', at: 2, x: 10, y: 20 },
      },
      on,
    );
    const entries = [...menu.querySelectorAll<HTMLElement>('.pointed .entry')];

    expect(entries.map((one) => one.textContent)).toEqual([
      'Insert 2 columns left',
      'Insert 2 columns right',
      'Delete 2 columns',
      'Hide these 2 columns',
      'Group these 2 columns',
    ]);

    entries[0]?.click();
    expect(on.line).toHaveBeenCalledWith('column', 2, 2);

    entries[1]?.click();
    expect(on.line).toHaveBeenLastCalledWith('column', 4, 2);

    entries[2]?.click();
    expect(on.line).toHaveBeenLastCalledWith('column', 2, -2);

    entries[3]?.click();
    expect(on.hide).toHaveBeenCalledWith('column', 2, 3, true);

    entries[4]?.click();
    expect(on.group).toHaveBeenCalledWith('column', 2, 3, 1);
  });

  it('asks for a cell’s own menu at the pointer, and takes nothing itself', () => {
    const on = asks();
    const into = shown(
      {
        drawing: drawing({ sheets: [wide] }),
        selected: { row: 1, col: 1 },
        anchor: { row: 2, col: 3 },
      },
      on,
    );

    // The button that opens the menu presses the cell first, as a mouse does.
    at(into, 2, 2)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    at(into, 2, 2)?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );

    expect(on.select).not.toHaveBeenCalled();
    expect(on.pointAt).toHaveBeenCalledWith({ kind: 'cell', row: 2, col: 2, x: 0, y: 0 });
  });

  it('offers the way back where a run beside the heading is hidden', () => {
    const on = asks();
    const hides = sheet({
      rows: 2,
      columns: 4,
      of: { rows: 40, columns: 4 },
      widths: [{ first: 2, last: 3, size: null, hidden: true, group: null }],
    });
    const menu = shown(
      {
        drawing: drawing({ sheets: [hides] }),
        pointed: { kind: 'heading', axis: 'column', at: 4, x: 10, y: 20 },
      },
      on,
    );

    const entries = [...menu.querySelectorAll<HTMLElement>('.pointed .entry')];
    expect(entries.map((one) => one.textContent)).toEqual([
      'Insert column left',
      'Insert column right',
      'Delete this column',
      'Hide this column',
      'Show columns B-C again',
      'Group this column',
    ]);
  });

  it('lights the headings the selection reaches, and puts them out when it moves', () => {
    const into = document.createElement('div');
    const state = (at: Showing['selected'], to: Showing['anchor'] = null): Showing => ({
      ...showingOf({ drawing: drawing({ sheets: [wide] }) }),
      selected: at,
      anchor: to,
    });
    const lit = () => [...into.querySelectorAll('th.selected')].map((one) => one.textContent);

    // Column B is the one reached; the window draws two rows of the forty taken.
    draw(into, state({ row: 1, col: 2 }, { row: 40, col: 3 }), asks());
    expect(lit()).toEqual(['B', '1', '2']);

    restate(into, state({ row: 1, col: 1 }, { row: 1, col: 1 }), asks());
    expect(lit()).toEqual(['A', '1']);
  });
});

describe('what the view asks for', () => {
  it('asks to select the cell that was clicked', () => {
    const on = asks();
    const into = shown({}, on);
    at(into, 2, 1)?.dispatchEvent(new MouseEvent('mousedown'));

    expect(on.select).toHaveBeenCalledWith(2, 1);
  });

  it('asks to put what was typed into the cell it was typed in', () => {
    const on = asks();
    const cells = [cell(1, 1, { value: 'APAC' })];
    const into = shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }, on);

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('dblclick'));
    const box = into.querySelector('.typing');
    if (!(box instanceof HTMLTextAreaElement)) throw new Error('nothing to type into');

    expect(box.value).toBe('APAC');
    box.value = 'EMEA';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(on.edit).toHaveBeenCalledWith(1, 1, 'EMEA');
  });

  it('seeds the box with the formula the spec holds, not what it came to', () => {
    const on = asks();
    const computed = { kind: 'value', value: 4150000 } as const;
    const cells = [cell(1, 1, { formula: 'SUM(B1:B2)', computed })];
    const into = shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }, on);

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('dblclick'));
    expect(into.querySelector<HTMLTextAreaElement>('.typing')?.value).toBe('=SUM(B1:B2)');
  });

  it('opens the cell on Enter, the way a spreadsheet does', () => {
    const on = asks();
    const cells = [cell(1, 1, { value: 'APAC' })];
    const into = shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }, on);

    at(into, 1, 1)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(into.querySelector<HTMLTextAreaElement>('.typing')?.value).toBe('APAC');
  });

  it('starts with the character typed, because typing over a cell replaces it', () => {
    const on = asks();
    const cells = [cell(1, 1, { value: 'APAC' })];
    const into = shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }, on);

    at(into, 1, 1)?.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));
    const box = into.querySelector('.typing');
    if (!(box instanceof HTMLTextAreaElement)) throw new Error('nothing to type into');

    expect(box.value).toBe('4');
    box.value = '42';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(on.edit).toHaveBeenCalledWith(1, 1, '42');
  });

  it('leaves a cell alone for a keystroke that is not typing', () => {
    const on = asks();
    const into = shown({}, on);

    at(into, 1, 1)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', metaKey: true }));
    at(into, 1, 1)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    expect(into.querySelector('.typing')).toBeNull();
  });

  it('moves down when an edit is committed, so a column can be typed straight through', () => {
    const on = asks();
    const into = shown({}, on);

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('dblclick'));
    into.querySelector('.typing')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(on.select).toHaveBeenCalledWith(2, 1);
  });

  it('lets the reader keep typing, rather than opening a box per keystroke', () => {
    // The box is inside the cell, so its keys reach the cell's own handlers
    // unless something stops them — and every one of those opened another box
    // over the last, swallowing the character on the way.
    const on = asks();
    const into = shown({}, on);

    at(into, 1, 1)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'E' }));
    const box = into.querySelector('.typing');
    if (!(box instanceof HTMLTextAreaElement)) throw new Error('nothing to type into');

    for (const key of ['M', 'E', 'A']) {
      const stroke = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      box.dispatchEvent(stroke);
      // Not refused on the way past: a swallowed keystroke is a character the
      // reader typed and did not get.
      expect(stroke.defaultPrevented).toBe(false);
    }

    expect(into.querySelectorAll('.typing')).toHaveLength(1);
    expect(on.edit).not.toHaveBeenCalled();
  });

  it('commits once, from the box the reader was typing in', () => {
    const on = asks();
    const into = shown({}, on);

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('dblclick'));
    const box = into.querySelector('.typing');
    if (!(box instanceof HTMLTextAreaElement)) throw new Error('nothing to type into');

    box.value = 'EMEA';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(on.edit).toHaveBeenCalledTimes(1);
    expect(on.edit).toHaveBeenCalledWith(1, 1, 'EMEA');
    expect(into.querySelector('.typing')).toBeNull();
  });

  it('leaves the cell alone when the typing is abandoned', () => {
    const on = asks();
    const into = shown({}, on);

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('dblclick'));
    const box = into.querySelector('.typing');
    if (!(box instanceof HTMLTextAreaElement)) throw new Error('nothing to type into');

    box.value = 'never mind';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(on.edit).not.toHaveBeenCalled();
    expect(into.querySelector('.typing')).toBeNull();
  });

  it('asks to show the sheet whose tab was clicked', () => {
    const on = asks();
    const two = drawing({ sheets: [sheet(), sheet({ name: 'Notes' })] });
    const into = shown({ drawing: two }, on);

    [...into.querySelectorAll('.tab')][1]?.dispatchEvent(new MouseEvent('click'));
    expect(on.showSheet).toHaveBeenCalledWith(1);
  });

  it('asks to set a parameter when its box changes', () => {
    const on = asks();
    const withParams = drawing({ params: [{ name: 'region', value: 'APAC', set: false }] });
    const into = shown({ drawing: withParams }, on);

    const box = into.querySelector('.boxes input');
    if (!(box instanceof HTMLInputElement)) throw new Error('no box');

    box.value = 'EMEA';
    box.dispatchEvent(new Event('change'));
    expect(on.setParam).toHaveBeenCalledWith('region', 'EMEA');
  });

  it('asks to be taken to the source an inspector line names', () => {
    const on = asks();
    const source = { facet: 'value', says: 'written at `A1`', file: 'f', start: 1, end: 2 };
    const into = shown({ selected: { row: 1, col: 1 }, sources: [source] }, on);

    into.querySelector<HTMLElement>('.inspector .go')?.click();
    expect(on.reveal).toHaveBeenCalledWith(source);
  });
});

describe('moving about the grid with the keys', () => {
  /** A sheet with room to move in, drawn whole. */
  const room = () =>
    drawing({ sheets: [sheet({ rows: 4, columns: 4, of: { rows: 4, columns: 4 } })] });

  const press = (into: HTMLElement, row: number, col: number, key: string, shift = false) => {
    at(into, row, col)?.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: shift }));
  };

  it('moves the selection one cell at a time, by the arrow keys', () => {
    const on = asks();
    const into = shown({ drawing: room() }, on);

    press(into, 2, 2, 'ArrowDown');
    expect(on.select).toHaveBeenCalledWith(3, 2);

    press(into, 2, 2, 'ArrowRight');
    expect(on.select).toHaveBeenCalledWith(2, 3);
  });

  it('moves across by tab, and back by shift-tab', () => {
    const on = asks();
    const into = shown({ drawing: room() }, on);

    press(into, 2, 2, 'Tab');
    expect(on.select).toHaveBeenCalledWith(2, 3);

    press(into, 2, 2, 'Tab', true);
    expect(on.select).toHaveBeenCalledWith(2, 1);
  });

  it('stops at the edge of the sheet rather than running past it', () => {
    const on = asks();
    const into = shown({ drawing: room() }, on);

    press(into, 1, 1, 'ArrowUp');
    press(into, 1, 1, 'ArrowLeft');
    expect(on.select).toHaveBeenCalledTimes(2);
    expect(on.select).toHaveBeenCalledWith(1, 1);
  });

  it('gives the focus to the cell it moved to, so the next key lands there', () => {
    const into = shown({ drawing: room() });
    document.body.append(into);

    at(into, 2, 2)?.focus();
    press(into, 2, 2, 'ArrowDown');

    expect(document.activeElement).toBe(at(into, 3, 2));
    into.remove();
  });

  it('asks the host for a window around a cell that is not drawn', () => {
    // The sheet is a hundred rows and two of them are drawn; moving off the
    // bottom of what is there is a question for the host, not a lost keystroke.
    const on = asks();
    const large = drawing({ sheets: [sheet({ rows: 2, of: { rows: 100, columns: 2 } })] });
    const into = shown({ drawing: large }, on);

    press(into, 2, 1, 'ArrowDown');
    expect(on.showWindow).toHaveBeenCalledWith(3, 1);
  });

  it('lands the reader on the cell below, with the keys still theirs', () => {
    // The box is gone by then, and a cell that does not hold the focus is a
    // grid whose arrow keys do nothing.
    const on = asks();
    const into = shown({ drawing: room() }, on);
    document.body.append(into);

    at(into, 2, 2)?.dispatchEvent(new MouseEvent('dblclick'));
    const box = into.querySelector('.typing');
    if (!(box instanceof HTMLTextAreaElement)) throw new Error('nothing to type into');

    box.value = 'EMEA';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(on.edit).toHaveBeenCalledWith(2, 2, 'EMEA');
    expect(on.select).toHaveBeenCalledWith(3, 2);
    expect(document.activeElement).toBe(at(into, 3, 2));
    into.remove();
  });

  it('reaches to a cell shift-clicked, keeping where it started', () => {
    const on = asks();
    const into = shown({ drawing: room() }, on);

    at(into, 2, 2)?.dispatchEvent(new MouseEvent('mousedown'));
    at(into, 4, 3)?.dispatchEvent(new MouseEvent('mousedown', { shiftKey: true }));

    expect(on.select).toHaveBeenCalledWith(2, 2);
    expect(on.reachTo).toHaveBeenCalledWith(4, 3);
  });

  it('reaches to a cell dragged over, and not to one merely passed under', () => {
    const on = asks();
    const into = shown({ drawing: room() }, on);

    at(into, 3, 3)?.dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    at(into, 4, 4)?.dispatchEvent(new MouseEvent('mouseenter', { buttons: 0 }));

    expect(on.dragTo).toHaveBeenCalledTimes(1);
    expect(on.dragTo).toHaveBeenCalledWith(3, 3);
  });

  it('takes the range with it on shift-arrow, and leaves it behind on arrow', () => {
    const on = asks();
    const into = shown({ drawing: room() }, on);

    press(into, 2, 2, 'ArrowDown', true);
    expect(on.reachTo).toHaveBeenCalledWith(3, 2);

    press(into, 2, 2, 'ArrowDown');
    expect(on.select).toHaveBeenCalledWith(3, 2);
  });

  it('steps back on shift-tab rather than reaching', () => {
    const on = asks();
    const into = shown({ drawing: room() }, on);

    press(into, 2, 2, 'Tab', true);
    expect(on.select).toHaveBeenCalledWith(2, 1);
    expect(on.reachTo).not.toHaveBeenCalled();
  });

  it('takes the whole sheet on cmd-A, from its first cell to its last', () => {
    const on = asks();
    const into = shown({ drawing: room() }, on);

    at(into, 2, 2)?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true }),
    );

    expect(on.takeAll).toHaveBeenCalled();
  });

  it('draws the rectangle between the two corners, and only that', () => {
    const showing = { drawing: room(), selected: { row: 3, col: 3 }, anchor: { row: 2, col: 2 } };
    const into = shown(showing);

    const ranged = [...into.querySelectorAll('td.ranged')].map((cell) =>
      cell.getAttribute('data-at'),
    );
    expect(ranged.sort()).toEqual(['2:2', '2:3', '3:2', '3:3']);
  });

  it('draws no rectangle for a selection of one cell', () => {
    const showing = { drawing: room(), selected: { row: 2, col: 2 }, anchor: { row: 2, col: 2 } };
    expect(shown(showing).querySelector('td.ranged')).toBeNull();
  });

  it('empties a cell on delete, which is typing nothing into it', () => {
    const on = asks();
    const into = shown({ drawing: room() }, on);

    press(into, 2, 2, 'Delete');
    expect(on.empty).toHaveBeenCalledWith(2, 2);
  });

  it('asks about the cell it was pressed on, and leaves the rectangle to the view', () => {
    const on = asks();
    const into = shown(
      { drawing: room(), selected: { row: 3, col: 3 }, anchor: { row: 2, col: 2 } },
      on,
    );

    press(into, 3, 3, 'Delete');
    expect(on.empty).toHaveBeenCalledWith(3, 3);
    expect(on.edit).not.toHaveBeenCalled();
  });

  it('leaves the keys a cell is typed into alone', () => {
    const on = asks();
    const into = shown({ drawing: room() }, on);

    press(into, 2, 2, 'x');
    expect(on.select).not.toHaveBeenCalled();
  });
});

describe('a cell with more than one line in it', () => {
  const into = () => {
    const box = document.createElement('div');
    draw(
      box,
      showingOf({ drawing: drawing({ sheets: [sheet({ cells: [cell(1, 1)] })] }) }),
      asks(),
    );
    return box;
  };

  const typing = (box: HTMLElement) => box.querySelector<HTMLTextAreaElement>('.typing');

  it('takes a line break from the keys both spreadsheets use, without committing', () => {
    const on = asks();
    const box = document.createElement('div');
    draw(box, showingOf({ drawing: drawing({ sheets: [sheet({ cells: [cell(1, 1)] })] }) }), on);

    at(box, 1, 1)?.dispatchEvent(new MouseEvent('dblclick'));
    const typed = typing(box);
    if (typed === null) throw new Error('nothing to type into');

    typed.value = 'one';
    typed.selectionStart = 3;
    typed.selectionEnd = 3;
    typed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', altKey: true }));
    typed.value = `${typed.value}two`;

    expect(typed.value).toBe('one\ntwo');
    expect(on.edit).not.toHaveBeenCalled();
  });

  it('commits it whole on `Enter`, line break and all', () => {
    const on = asks();
    const box = document.createElement('div');
    draw(box, showingOf({ drawing: drawing({ sheets: [sheet({ cells: [cell(1, 1)] })] }) }), on);

    at(box, 1, 1)?.dispatchEvent(new MouseEvent('dblclick'));
    const typed = typing(box);
    if (typed === null) throw new Error('nothing to type into');

    typed.value = 'one\ntwo';
    typed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(on.edit).toHaveBeenCalledWith(1, 1, 'one\ntwo');
  });

  it('leaves the reader where each key leaves them, as both spreadsheets move', () => {
    const on = asks();
    const box = document.createElement('div');
    const drawn = drawing({ sheets: [sheet({ rows: 3, columns: 3, cells: [cell(2, 2)] })] });
    draw(box, showingOf({ drawing: drawn }), on);

    at(box, 2, 2)?.dispatchEvent(new MouseEvent('dblclick'));
    typing(box)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    expect(on.select).toHaveBeenLastCalledWith(1, 2);

    at(box, 2, 2)?.dispatchEvent(new MouseEvent('dblclick'));
    typing(box)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(on.select).toHaveBeenLastCalledWith(2, 3);

    at(box, 2, 2)?.dispatchEvent(new MouseEvent('dblclick'));
    typing(box)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    expect(on.select).toHaveBeenLastCalledWith(2, 1);
  });

  it('is drawn with the break rather than with it eaten by `nowrap`', () => {
    const box = document.createElement('div');
    const lines = cell(1, 1, { value: 'one\ntwo' });
    draw(box, showingOf({ drawing: drawing({ sheets: [sheet({ cells: [lines] })] }) }), asks());

    expect(at(box, 1, 1)?.style.whiteSpace).toBe('pre-wrap');
    expect(at(box, 2, 1)?.style.whiteSpace).toBe('');
  });

  it('opens the box on what the cell holds, breaks and all', () => {
    const box = document.createElement('div');
    const lines = cell(1, 1, { value: 'one\ntwo' });
    draw(box, showingOf({ drawing: drawing({ sheets: [sheet({ cells: [lines] })] }) }), asks());

    at(box, 1, 1)?.dispatchEvent(new MouseEvent('dblclick'));
    expect(typing(box)?.value).toBe('one\ntwo');
    expect(typing(box)?.rows).toBe(2);
  });

  it('draws nothing of the sort where the value has no break in it', () => {
    expect(typing(into())).toBeNull();
  });
});

describe('text that does not fit its cell', () => {
  const wide = (of: Partial<DrawnSheet> = {}) =>
    drawing({ sheets: [sheet({ rows: 1, columns: 3, ...of })] });

  it('runs over the empty cells beside it, as both spreadsheets let it', () => {
    const held = wide({ cells: [cell(1, 1, { value: 'a very long heading indeed' })] });
    const one = held.sheets[0];
    const over = at(shown({ drawing: held }), 1, 1)?.querySelector<HTMLElement>('.spill');

    expect(over?.textContent).toBe('a very long heading indeed');
    if (one === undefined) throw new Error('no sheet');
    expect(over?.style.maxWidth).toBe(`${widthOf(one, 1) + widthOf(one, 2) + widthOf(one, 3)}px`);
  });

  it('stops at the first cell that shows anything', () => {
    const held = wide({
      cells: [cell(1, 1, { value: 'a very long heading indeed' }), cell(1, 2, { value: 'stop' })],
    });

    expect(at(shown({ drawing: held }), 1, 1)?.querySelector('.spill')).toBeNull();
  });

  it('does not run where the cell wraps, which is what wrapping is for', () => {
    const held = wide({
      cells: [cell(1, 1, { value: 'a very long heading', style: { 'align.wrap': true } })],
    });

    expect(at(shown({ drawing: held }), 1, 1)?.querySelector('.spill')).toBeNull();
  });

  it('does not run where the text is not left-aligned, which would run the wrong way', () => {
    const held = wide({
      cells: [cell(1, 1, { value: 'a very long heading', style: { 'align.horizontal': 'right' } })],
    });

    expect(at(shown({ drawing: held }), 1, 1)?.querySelector('.spill')).toBeNull();
  });
});

describe('a sheet with a filter on its header row', () => {
  it('marks each header cell, and nothing under them', () => {
    const held = drawing({
      sheets: [
        sheet({
          rows: 2,
          columns: 2,
          filter: { top: 1, left: 1, bottom: 1, right: 2 },
          cells: [cell(1, 1, { value: 'Region' }), cell(2, 1, { value: 'EMEA' })],
        }),
      ],
    });
    const into = shown({ drawing: held });

    expect(at(into, 1, 1)?.querySelector('.dropdown')).not.toBeNull();
    expect(at(into, 1, 2)?.querySelector('.dropdown')).not.toBeNull();
    expect(at(into, 2, 1)?.querySelector('.dropdown')).toBeNull();
  });

  it('says what the mark is while the pointer is over the header', () => {
    const held = drawing({
      sheets: [sheet({ rows: 1, columns: 1, filter: { top: 1, left: 1, bottom: 1, right: 1 } })],
    });
    const cell = at(shown({ drawing: held }), 1, 1);

    cell?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(cell?.querySelector('.notice')?.textContent).toBe(
      'This column has a filter; the preview does not filter by it',
    );
  });
});

describe('a sheet with a table over part of it', () => {
  const over = (of: Partial<DrawnTable> = {}) =>
    drawing({
      sheets: [
        sheet({
          rows: 4,
          columns: 3,
          tables: [
            {
              top: 1,
              left: 1,
              bottom: 4,
              right: 2,
              name: 'Revenue',
              style: null,
              bandedRows: true,
              bandedColumns: false,
              firstColumn: false,
              lastColumn: false,
              ...of,
            },
          ],
        }),
      ],
    });

  it('heads the top row, and leaves the cells beside the table alone', () => {
    const into = shown({ drawing: over() });

    expect(at(into, 1, 1)?.className).toContain('heads');
    expect(at(into, 2, 1)?.className).toContain('tabled');
    expect(at(into, 2, 1)?.className).not.toContain('heads');
    expect(at(into, 1, 3)?.className).not.toContain('tabled');
  });

  it('gives the header row the dropdown a table carries filter buttons as', () => {
    const into = shown({ drawing: over() });

    expect(at(into, 1, 1)?.querySelector('.dropdown')).not.toBeNull();
    expect(at(into, 2, 1)?.querySelector('.dropdown')).toBeNull();
  });

  it('bands every other data row, starting under the header', () => {
    const into = shown({ drawing: over() });
    const banded = [2, 3, 4].map((row) => at(into, row, 1)?.className.includes('banded'));

    expect(banded).toEqual([true, false, true]);
  });

  it('bands every other column instead where the spec asks for that', () => {
    const into = shown({ drawing: over({ bandedRows: false, bandedColumns: true }) });

    expect(at(into, 2, 1)?.className).toContain('banded');
    expect(at(into, 2, 2)?.className).not.toContain('banded');
  });

  it('marks the first and the last column where the toggles ask for them', () => {
    const into = shown({ drawing: over({ firstColumn: true, lastColumn: true }) });

    expect(at(into, 2, 1)?.className).toContain('edging');
    expect(at(into, 2, 2)?.className).toContain('edging');
  });

  it('says what the header row heads while the pointer is over it', () => {
    const cell = at(shown({ drawing: over() }), 1, 1);

    cell?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(cell?.querySelector('.notice')?.textContent).toBe('This row heads the table Revenue');
  });
});

describe('a cell that carries a note', () => {
  const noted = (of: Partial<Showing> = {}, on: Asks = asks()) => {
    const held = drawing({
      sheets: [
        sheet({
          rows: 2,
          columns: 2,
          cells: [cell(1, 1, { value: 'Region', note: { text: 'check stock', author: 'Ada' } })],
        }),
      ],
    });
    return shown({ drawing: held, ...of }, on);
  };

  it('wears the corner, and says the note with its author while the pointer is over it', () => {
    const into = noted();
    const cell = at(into, 1, 1);

    expect(cell?.querySelector('.noted')).not.toBeNull();
    expect(at(into, 1, 2)?.querySelector('.noted')).toBeNull();

    cell?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(cell?.querySelector('.notice')?.textContent).toBe('Ada: check stock');

    cell?.dispatchEvent(new MouseEvent('mouseleave'));
    expect(cell?.querySelector('.notice')).toBeNull();
  });

  it('is written in a box over the cell, which sends what was typed', () => {
    const on = asks();
    const into = noted({ asking: { at: { row: 1, col: 1 }, what: 'note' } }, on);
    const box = at(into, 1, 1)?.querySelector<HTMLTextAreaElement>('.noting');
    if (box === null || box === undefined) throw new Error('there is no box');

    expect(box.value).toBe('check stock');
    box.value = 'checked with Finance';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(on.note).toHaveBeenCalledWith(1, 1, 'checked with Finance');
  });
});

describe('a cell that carries a link', () => {
  const linked = (of: Partial<Showing> = {}, on: Asks = asks()) => {
    const held = drawing({
      sheets: [
        sheet({
          rows: 1,
          columns: 2,
          cells: [
            cell(1, 1, {
              value: 'Order 1001',
              link: { kind: 'url', target: 'https://example.com', tip: 'The order' },
            }),
          ],
        }),
      ],
    });
    return shown({ drawing: held, ...of }, on);
  };

  it('is drawn as a link, and says the tip and where it goes on hover', () => {
    const into = linked();
    const cell = at(into, 1, 1);

    expect(cell?.classList.contains('linked')).toBe(true);
    expect(at(into, 1, 2)?.classList.contains('linked')).toBe(false);

    cell?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(cell?.querySelector('.notice')?.textContent).toContain('The order');
    expect(cell?.querySelector('.notice')?.textContent).toContain('https://example.com');
  });

  it('is followed by holding the key and clicking, and selected by clicking alone', () => {
    const on = asks();
    const cell = at(linked({}, on), 1, 1);

    cell?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, metaKey: true }));
    expect(on.follow).toHaveBeenCalledWith(1, 1);
    expect(on.select).not.toHaveBeenCalled();

    cell?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(on.select).toHaveBeenCalledWith(1, 1);
  });

  it('is typed into a box that opens holding the target, and sends it back as its kind', () => {
    const on = asks();
    const into = linked({ asking: { at: { row: 1, col: 1 }, what: 'url' } }, on);
    const box = at(into, 1, 1)?.querySelector<HTMLTextAreaElement>('.linking');
    if (box === null || box === undefined) throw new Error('there is no box');

    expect(box.value).toBe('https://example.com');
    box.value = 'https://example.com/two';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(on.link).toHaveBeenCalledWith(1, 1, {
      kind: 'url',
      text: 'https://example.com/two',
    });
  });

  it('opens an empty box for the other kind, since the two are not the same target', () => {
    const into = linked({ asking: { at: { row: 1, col: 1 }, what: 'to' } });
    expect(at(into, 1, 1)?.querySelector<HTMLTextAreaElement>('.linking')?.value).toBe('');
  });
});

describe('a cell a validation covers', () => {
  const asked = (of: Partial<DrawnCell>, showing: Partial<Showing> = {}, on: Asks = asks()) => {
    const held = drawing({
      sheets: [sheet({ rows: 1, columns: 2, cells: [cell(1, 1, { value: 'Draft', ...of })] })],
    });
    return shown({ drawing: held, ...showing }, on);
  };

  it('wears the dropdown where it offers a list, and a corner where it only asks', () => {
    const list = { choices: ['Draft', 'Sent'], says: 'One of the values in the list.' };
    expect(at(asked({ validation: list }), 1, 1)?.querySelector('.dropdown')).not.toBeNull();

    const whole = { choices: null, says: 'A whole number at least 1.' };
    const cell = at(asked({ validation: whole }), 1, 1);
    expect(cell?.querySelector('.asked')).not.toBeNull();
    expect(cell?.querySelector('.dropdown')).toBeNull();
  });

  it('marks a cell that holds something, and leaves an empty one of the range quiet', () => {
    // A range is two hundred rows: a mark on every empty one of them is noise.
    const list = { choices: ['Draft'], says: '' };
    const held = drawing({
      sheets: [
        sheet({
          rows: 2,
          columns: 1,
          cells: [
            cell(1, 1, { value: 'Draft', validation: list }),
            cell(2, 1, { value: null, validation: list }),
          ],
        }),
      ],
    });
    const into = shown({ drawing: held });

    expect(at(into, 1, 1)?.classList.contains('holds')).toBe(true);
    expect(at(into, 2, 1)?.classList.contains('holds')).toBe(false);
    expect(at(into, 2, 1)?.querySelector('.asks')).not.toBeNull();
  });

  it('says what it asks while the pointer is over it', () => {
    const whole = { choices: null, says: 'A whole number at least 1.' };
    const cell = at(asked({ validation: whole }), 1, 1);

    cell?.dispatchEvent(new MouseEvent('mouseenter'));
    expect(cell?.querySelector('.notice')?.textContent).toBe('A whole number at least 1.');
  });

  it('offers its choices while the cell is typed into, and one picked is the edit', () => {
    const on = asks();
    const list = { choices: ['Draft', 'Sent'], says: '' };
    const cell = at(asked({ validation: list }, {}, on), 1, 1);

    cell?.dispatchEvent(new MouseEvent('dblclick'));
    const choices = [...(cell?.querySelectorAll<HTMLButtonElement>('.choices .offer') ?? [])];
    expect(choices.map((one) => one.textContent)).toEqual(['Draft', 'Sent']);

    choices[1]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(on.edit).toHaveBeenCalledWith(1, 1, 'Sent');
    expect(cell?.querySelector('.choices')).toBeNull();
  });

  it('takes the choices typed into the box as a list, commas and all', () => {
    const on = asks();
    const into = asked({}, { asking: { at: { row: 1, col: 1 }, what: 'list' } }, on);
    const box = at(into, 1, 1)?.querySelector<HTMLTextAreaElement>('.linking');
    if (box === null || box === undefined) throw new Error('there is no box');

    box.value = 'Draft, Sent , Paid';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(on.validate).toHaveBeenCalledWith(['Draft', 'Sent', 'Paid']);
  });
});
