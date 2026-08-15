// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { type Asks, draw, restate, type Showing } from './draw';
import type { Drawing, DrawnCell, DrawnSheet } from './protocol';

function asks(): Asks {
  return {
    showSheet: vi.fn(),
    select: vi.fn(),
    reveal: vi.fn(),
    setParam: vi.fn(),
    showWindow: vi.fn(),
    edit: vi.fn(),
    overrideWith: vi.fn(),
  };
}

function cell(row: number, col: number, of: Partial<DrawnCell> = {}): DrawnCell {
  return {
    row,
    col,
    value: null,
    formula: null,
    filledFrom: null,
    format: null,
    rich: null,
    computed: null,
    overridden: false,
    editable: 'direct',
    style: {},
    ...of,
  };
}

function sheet(of: Partial<DrawnSheet> = {}): DrawnSheet {
  return {
    name: 'Sales',
    rows: 2,
    columns: 2,
    at: { row: 1, col: 1 },
    of: { rows: of.rows ?? 2, columns: of.columns ?? 2 },
    widths: [],
    heights: [],
    cells: [],
    merges: [],
    problems: [],
    ...of,
  };
}

function drawing(of: Partial<Drawing> = {}): Drawing {
  return {
    kind: 'drawing',
    file: 'spec.yxl.yaml',
    sheets: [sheet()],
    params: [],
    diagnostics: [],
    uncomputed: null,
    ...of,
  };
}

function shown(of: Partial<Showing> = {}, on: Asks = asks()): HTMLElement {
  const into = document.createElement('div');
  draw(
    into,
    {
      drawing: drawing(),
      sheet: 0,
      selected: null,
      sources: null,
      reached: null,
      refused: null,
      said: null,
      editable: null,
      ...of,
    },
    on,
  );
  return into;
}

/** The cell at a place, as the drawn table has it. */
function at(into: HTMLElement, row: number, col: number): HTMLTableCellElement | undefined {
  const line = into.querySelectorAll('tbody tr')[row - 1];
  return [...(line?.querySelectorAll('td') ?? [])][col - 1];
}

/** Leave the scroller somewhere, as a reader would. */
function scrolled(into: HTMLElement, top: number): void {
  const box = into.querySelector('.scroller');
  if (!(box instanceof HTMLElement)) throw new Error('no scroller');
  box.scrollTop = top;
}

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
      sources: null,
      reached: null,
      refused: null,
      said: null,
      editable: null,
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
      sources: null,
      reached: null,
      refused: null,
      said: null,
      editable: null,
    });

    draw(into, showing(0), on);
    scrolled(into, 1400);

    draw(into, showing(1), on);
    expect(into.querySelector<HTMLElement>('.scroller')?.scrollTop).toBe(0);
  });
});

describe('what the view asks for', () => {
  it('asks to select the cell that was clicked', () => {
    const on = asks();
    const into = shown({}, on);
    at(into, 2, 1)?.click();

    expect(on.select).toHaveBeenCalledWith(2, 1);
  });

  it('asks to put what was typed into the cell it was typed in', () => {
    const on = asks();
    const cells = [cell(1, 1, { value: 'APAC' })];
    const into = shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }, on);

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('dblclick'));
    const box = into.querySelector('.typing');
    if (!(box instanceof HTMLInputElement)) throw new Error('nothing to type into');

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
    expect(into.querySelector<HTMLInputElement>('.typing')?.value).toBe('=SUM(B1:B2)');
  });

  it('opens the cell on Enter, the way a spreadsheet does', () => {
    const on = asks();
    const cells = [cell(1, 1, { value: 'APAC' })];
    const into = shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }, on);

    at(into, 1, 1)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(into.querySelector<HTMLInputElement>('.typing')?.value).toBe('APAC');
  });

  it('starts with the character typed, because typing over a cell replaces it', () => {
    const on = asks();
    const cells = [cell(1, 1, { value: 'APAC' })];
    const into = shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }, on);

    at(into, 1, 1)?.dispatchEvent(new KeyboardEvent('keydown', { key: '4' }));
    const box = into.querySelector('.typing');
    if (!(box instanceof HTMLInputElement)) throw new Error('nothing to type into');

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
    if (!(box instanceof HTMLInputElement)) throw new Error('nothing to type into');

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
    if (!(box instanceof HTMLInputElement)) throw new Error('nothing to type into');

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
    if (!(box instanceof HTMLInputElement)) throw new Error('nothing to type into');

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

describe('what changes without redrawing the grid', () => {
  function showing(of: Partial<Showing> = {}): Showing {
    return {
      drawing: drawing(),
      sheet: 0,
      selected: null,
      sources: null,
      reached: null,
      refused: null,
      said: null,
      editable: null,
      ...of,
    };
  }

  it('keeps the very cells it drew, so a click can be followed by another', () => {
    // A grid rebuilt on selection is a grid whose cells cannot be
    // double-clicked: the second click lands on an element that was not there
    // for the first.
    const into = document.createElement('div');
    draw(into, showing(), asks());

    const cell = at(into, 1, 1);
    restate(into, showing({ selected: { row: 1, col: 1 } }), asks());

    expect(at(into, 1, 1)).toBe(cell);
    expect(cell?.classList.contains('selected')).toBe(true);
  });

  it('moves the selection off the cell that had it', () => {
    const into = document.createElement('div');
    draw(into, showing({ selected: { row: 1, col: 1 } }), asks());
    restate(into, showing({ selected: { row: 2, col: 1 } }), asks());

    expect(at(into, 1, 1)?.classList.contains('selected')).toBe(false);
    expect(at(into, 2, 1)?.classList.contains('selected')).toBe(true);
  });

  it('lights up what the cursor reaches, and puts it out again', () => {
    const into = document.createElement('div');
    const reached = { says: 'the style `header`', cells: new Set(['1:1']) };
    draw(into, showing(), asks());

    restate(into, showing({ reached }), asks());
    expect(at(into, 1, 1)?.classList.contains('reached')).toBe(true);

    restate(into, showing({ reached: { says: 'x', cells: new Set() } }), asks());
    expect(at(into, 1, 1)?.classList.contains('reached')).toBe(false);
  });

  it('shows the answer about a cell under the grid', () => {
    const into = document.createElement('div');
    const sources = [{ facet: 'value', says: 'written at `A1`', file: 'f', start: 1, end: 2 }];
    draw(into, showing(), asks());
    restate(into, showing({ selected: { row: 1, col: 1 }, sources }), asks());

    expect(into.querySelector('.inspector dt')?.textContent).toBe('value');
  });

  it('draws the whole thing when there is no grid to keep', () => {
    const into = document.createElement('div');
    restate(into, showing(), asks());

    expect(into.querySelector('.grid')).not.toBeNull();
  });
});

describe('what the view says about a spec', () => {
  it('lists where each facet of the selected cell came from', () => {
    const sources = [
      { facet: 'value', says: 'the definition `defs.values.rate`', file: 'f', start: 0, end: 1 },
      { facet: 'font.bold', says: 'the style `header`', file: 'f', start: 2, end: 3 },
    ];
    const into = shown({ selected: { row: 1, col: 1 }, sources });

    expect([...into.querySelectorAll('.inspector dt')].map((one) => one.textContent)).toEqual([
      'value',
      'font.bold',
    ]);
    expect(into.querySelector('.inspector h2')?.textContent).toBe('A1');
  });

  it('marks a cell a diagnostic is about, and says what', () => {
    const problems = [{ row: 1, col: 1, message: 'no value is declared as `nosuch`' }];
    const drawn = at(shown({ drawing: drawing({ sheets: [sheet({ problems })] }) }), 1, 1);

    expect(drawn?.classList.contains('problem')).toBe(true);
    expect(drawn?.title).toContain('nosuch');
  });

  it('highlights the cells the cursor reaches, and counts them', () => {
    const reached = { says: 'the style `header`', cells: new Set(['1:1']) };
    const into = shown({ reached });

    expect(at(into, 1, 1)?.classList.contains('reached')).toBe(true);
    expect(into.querySelector('.reaching')?.textContent).toBe('the style `header` reaches 1 cell');
  });

  it('says what it could not compute, once, under the grid', () => {
    const names = { kind: 'names', names: ['StoreMaster[name]', 'target_revenue'] } as const;
    const said = shown({ drawing: drawing({ uncomputed: names }) });

    expect(said.querySelector('.note')?.textContent).toContain('StoreMaster[name]');
    expect(said.querySelector('.note')?.textContent).toContain('does not model tables');
  });

  it('says when a workbook was too large to compute any of', () => {
    // Computing the part that fits would make every total over the rest wrong,
    // so nothing is computed and the reader is told which it is.
    const said = shown({ drawing: drawing({ uncomputed: { kind: 'tooMany', limit: 20000 } }) });
    expect(said.querySelector('.note')?.textContent).toContain('more than 20000 formulas');
  });

  it('says nothing about computing when everything computed', () => {
    expect(shown().querySelector('.note')).toBeNull();
  });

  it('says why an edit did not happen, where the edit was made', () => {
    const refused = { kind: 'refused', why: 'B5 holds a formula', override: null } as const;
    expect(shown({ refused }).querySelector('.refused')?.textContent).toContain('holds a formula');
  });

  it('offers the exception where there is a cell it could be about', () => {
    const typed = { sheet: 'Sales', row: 5, col: 2, text: '5' };
    const refused = { kind: 'refused', why: 'B5 is filled by a range', override: typed } as const;
    const on = asks();
    const into = shown({ refused }, on);

    into.querySelector<HTMLElement>('.refused .go')?.click();
    expect(on.overrideWith).toHaveBeenCalledWith(typed, '');
  });

  it('takes the reason from the box beside it, where one was given', () => {
    const typed = { sheet: 'Sales', row: 5, col: 2, text: '5' };
    const refused = { kind: 'refused', why: 'B5 is filled by a range', override: typed } as const;
    const on = asks();
    const into = shown({ refused }, on);

    const why = into.querySelector('.refused .reason');
    if (!(why instanceof HTMLInputElement)) throw new Error('nowhere to say why');

    why.value = 'the audit settled this row';
    into.querySelector<HTMLElement>('.refused .go')?.click();

    expect(on.overrideWith).toHaveBeenCalledWith(typed, 'the audit settled this row');
  });

  it('takes Enter in that box as the same answer', () => {
    const typed = { sheet: 'Sales', row: 5, col: 2, text: '5' };
    const refused = { kind: 'refused', why: 'B5 is filled by a range', override: typed } as const;
    const on = asks();
    const into = shown({ refused }, on);

    const why = into.querySelector('.refused .reason');
    if (!(why instanceof HTMLInputElement)) throw new Error('nowhere to say why');

    why.value = 'settled';
    why.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(on.overrideWith).toHaveBeenCalledWith(typed, 'settled');
  });

  it('offers nothing where there is nothing an override could name', () => {
    const refused = { kind: 'refused', why: 'nothing is written there', override: null } as const;
    expect(shown({ refused }).querySelector('.refused .go')).toBeNull();
  });

  it('says a cell cannot be typed into, and what to do about it', () => {
    const said = shown({ selected: { row: 1, col: 1 }, sources: [], editable: 'external' });
    const locked = said.querySelector('.inspector .locked')?.textContent ?? '';

    expect(locked).toContain('cannot be typed into');
    expect(locked).toContain('offered an override');
  });

  it('says nothing of the sort about a cell one node of the spec writes', () => {
    const said = shown({ selected: { row: 1, col: 1 }, sources: [], editable: 'direct' });
    expect(said.querySelector('.inspector .locked')).toBeNull();
  });

  it('says a spec with no sheets has nothing to draw', () => {
    const into = shown({ drawing: drawing({ sheets: [] }) });
    expect(into.querySelector('.note')?.textContent).toContain('no sheets');
  });
});
