// @vitest-environment jsdom

import { type Color, parseColor } from '@yxl-vscode/units';
import { describe, expect, it, vi } from 'vitest';
import { type Asks, draw, type Showing } from './draw';
import type { Drawing, DrawnCell, DrawnSheet } from './protocol';

function asks(): Asks {
  return { showSheet: vi.fn(), select: vi.fn(), reveal: vi.fn(), setParam: vi.fn() };
}

function cell(row: number, col: number, of: Partial<DrawnCell> = {}): DrawnCell {
  return {
    row,
    col,
    value: null,
    formula: null,
    filledFrom: null,
    format: null,
    style: {},
    ...of,
  };
}

function sheet(of: Partial<DrawnSheet> = {}): DrawnSheet {
  return {
    name: 'Sales',
    rows: 2,
    columns: 2,
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

/** A colour, branded the way the projection would have branded it. */
function colour(hex: string): Color {
  const read = parseColor(hex);
  if (read === null) throw new Error(`not a colour: ${hex}`);
  return read;
}

describe('the grid', () => {
  it('draws a heading row of column names, and a number down the side', () => {
    const into = shown();
    const headings = [...into.querySelectorAll('thead th')].map((one) => one.textContent);
    const numbers = [...into.querySelectorAll('tbody th')].map((one) => one.textContent);

    expect(headings).toEqual(['', 'A', 'B']);
    expect(numbers).toEqual(['1', '2']);
  });

  it('puts a value where the spec put it', () => {
    const cells = [cell(2, 1, { value: 'APAC' })];
    expect(at(shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }), 2, 1)?.textContent).toBe(
      'APAC',
    );
  });

  it('draws a number under its format', () => {
    const cells = [cell(1, 1, { value: 0.085, format: '0.0%' })];
    expect(at(shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }), 1, 1)?.textContent).toBe(
      '8.5%',
    );
  });

  it('draws a formula as its own text, having computed nothing', () => {
    const cells = [cell(1, 1, { formula: 'SUM(A1:A2)' })];
    expect(at(shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }), 1, 1)?.textContent).toBe(
      '=SUM(A1:A2)',
    );
  });

  it('says where a filled cell reads from instead of a formula that is wrong there', () => {
    const cells = [cell(1, 1, { formula: 'B2*0.05', filledFrom: 'C2' })];
    const drawn = at(shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }), 1, 1);

    expect(drawn?.textContent).toBe('↧ C2');
    expect(drawn?.classList.contains('filled')).toBe(true);
    expect(drawn?.title).toContain('Excel shifts');
  });
});

describe('what a cell looks like', () => {
  it('wears the weight, the fill, and the alignment it was given', () => {
    const style = {
      'font.bold': true,
      fill: colour('FFFF00'),
      'align.horizontal': 'center',
    } as const;
    const cells = [cell(1, 1, { value: 'x', style })];
    const drawn = at(shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }), 1, 1);

    expect(drawn?.style.fontWeight).toBe('bold');
    expect(drawn?.style.backgroundColor).toBe('rgb(255, 255, 0)');
    expect(drawn?.style.textAlign).toBe('center');
  });

  it('reads a colour with an alpha byte, which CSS wants last', () => {
    // `FF00FF00` is opaque green in Excel's `AARRGGBB`. Handed to CSS as
    // written it would be transparent magenta, so the answer being green is
    // the reordering working.
    const cells = [cell(1, 1, { value: 'x', style: { fill: colour('FF00FF00') } })];
    const drawn = at(shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }), 1, 1);

    expect(drawn?.style.backgroundColor).toBe('rgb(0, 255, 0)');
  });

  it('draws each border edge it was given', () => {
    const style = {
      'border.top.style': 'thick',
      'border.top.color': colour('FF0000'),
    } as const;
    const cells = [cell(1, 1, { value: 'x', style })];
    const drawn = at(shown({ drawing: drawing({ sheets: [sheet({ cells })] }) }), 1, 1);

    expect(drawn?.style.borderTop).toBe('3px solid rgb(255, 0, 0)');
  });

  it('takes its width in character units and its height in points', () => {
    const sized = sheet({
      widths: [{ first: 1, last: 1, size: 10, hidden: false }],
      heights: [{ first: 1, last: 1, size: 30, hidden: false }],
    });
    const into = shown({ drawing: drawing({ sheets: [sized] }) });

    expect([...into.querySelectorAll<HTMLElement>('thead th')][1]?.style.width).toBe('70px');
    expect([...into.querySelectorAll<HTMLElement>('tbody tr')][0]?.style.height).toBe('40px');
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

  it('says what a page of preview left out', () => {
    const large = sheet({ rows: 200, columns: 50, of: { rows: 5001, columns: 60 } });
    const said = shown({ drawing: drawing({ sheets: [large] }) }).querySelector('.note');

    expect(said?.textContent).toContain('4801 more rows and 10 more columns are not drawn');
  });

  it('says nothing when the whole sheet is drawn', () => {
    expect(shown().querySelector('.note')).toBeNull();
  });

  it('says a spec with no sheets has nothing to draw', () => {
    const into = shown({ drawing: drawing({ sheets: [] }) });
    expect(into.querySelector('.note')?.textContent).toContain('no sheets');
  });
});
