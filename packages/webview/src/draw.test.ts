// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { type Asks, draw, type Showing } from './draw';
import type { Drawing, DrawnCell, DrawnSheet } from './protocol';

function asks(): Asks {
  return {
    showSheet: vi.fn(),
    select: vi.fn(),
    reveal: vi.fn(),
    setParam: vi.fn(),
    showWindow: vi.fn(),
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
    uncomputed: [],
    ...of,
  };
}

function shown(of: Partial<Showing> = {}, on: Asks = asks()): HTMLElement {
  const into = document.createElement('div');
  draw(
    into,
    { drawing: drawing(), sheet: 0, selected: null, sources: null, reached: null, ...of },
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
    const said = shown({
      drawing: drawing({ uncomputed: ['StoreMaster[name', 'target_revenue'] }),
    });

    expect(said.querySelector('.note')?.textContent).toContain('StoreMaster[name');
    expect(said.querySelector('.note')?.textContent).toContain('does not model tables');
  });

  it('says nothing about computing when everything computed', () => {
    expect(shown().querySelector('.note')).toBeNull();
  });

  it('says a spec with no sheets has nothing to draw', () => {
    const into = shown({ drawing: drawing({ sheets: [] }) });
    expect(into.querySelector('.note')?.textContent).toContain('no sheets');
  });
});
