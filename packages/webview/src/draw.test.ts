// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { draw, restate } from './draw';
import { asks, at, cell, drawing, sheet, showingOf, shown } from './harness';
import type { Showing } from './showing';

describe('what changes without redrawing the grid', () => {
  it('keeps the very cells it drew, so a click can be followed by another', () => {
    // A grid rebuilt on selection is a grid whose cells cannot be
    // double-clicked: the second click lands on an element that was not there
    // for the first.
    const into = document.createElement('div');
    draw(into, showingOf(), asks());

    const cell = at(into, 1, 1);
    restate(into, showingOf({ selected: { row: 1, col: 1 } }), asks());

    expect(at(into, 1, 1)).toBe(cell);
    expect(cell?.classList.contains('selected')).toBe(true);
  });

  it('moves the selection off the cell that had it', () => {
    const into = document.createElement('div');
    draw(into, showingOf({ selected: { row: 1, col: 1 } }), asks());
    restate(into, showingOf({ selected: { row: 2, col: 1 } }), asks());

    expect(at(into, 1, 1)?.classList.contains('selected')).toBe(false);
    expect(at(into, 2, 1)?.classList.contains('selected')).toBe(true);
  });

  it('lights up what the cursor reaches, and puts it out again', () => {
    const into = document.createElement('div');
    const reached = { says: 'the style `header`', cells: new Set(['1:1']) };
    draw(into, showingOf(), asks());

    restate(into, showingOf({ reached }), asks());
    expect(at(into, 1, 1)?.classList.contains('reached')).toBe(true);

    restate(into, showingOf({ reached: { says: 'x', cells: new Set() } }), asks());
    expect(at(into, 1, 1)?.classList.contains('reached')).toBe(false);
  });

  it('shows the answer about a cell under the grid', () => {
    const into = document.createElement('div');
    const sources = [{ facet: 'value', says: 'written at `A1`', file: 'f', start: 1, end: 2 }];
    draw(into, showingOf(), asks());
    restate(into, showingOf({ selected: { row: 1, col: 1 }, sources }), asks());

    expect(into.querySelector('.inspector dt')?.textContent).toBe('value');
  });

  it('draws the whole thing when there is no grid to keep', () => {
    const into = document.createElement('div');
    restate(into, showingOf(), asks());

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

  it("lists what the sheet carries and does not draw, apart from the cell's own answer", () => {
    const carried = [{ facet: 'pivots', says: 'pivot tables', file: 'f', start: 4, end: 5 }];
    const into = shown({ selected: { row: 1, col: 1 }, sources: [], carried });

    // The cell's own answer is unchanged by the sheet holding a pivot: what
    // the pivot covers is not read, so it says nothing about this cell.
    expect([...into.querySelectorAll('.inspector .note')].map((one) => one.textContent)).toEqual([
      'Nothing writes this cell.',
      'This sheet also holds, undrawn:',
    ]);
    expect([...into.querySelectorAll('.inspector dt')].map((one) => one.textContent)).toEqual([
      'pivots',
    ]);
  });

  it('says nothing of the sort where the sheet carries nothing', () => {
    const into = shown({ selected: { row: 1, col: 1 }, sources: [], carried: [] });
    expect([...into.querySelectorAll('.inspector .note')].map((one) => one.textContent)).toEqual([
      'Nothing writes this cell.',
    ]);
  });

  it('asks a refusal as a question over the panel, with the keyboard in it', () => {
    const typed = { sheet: 'Sales', row: 5, col: 2, text: '=B1*2' };
    const refused = {
      kind: 'refused',
      why: 'B5 is filled by a range',
      about: { kind: 'edit', ...typed },
      canOverride: true,
      choices: [{ id: 'rangeFormula', what: "Change the range's formula", moves: 2, sample: [] }],
    } as const;
    const into = shown({ refused });

    const over = into.querySelector('.over');
    expect(over?.querySelector('.refused')?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(into.querySelector('.refused .choice'));
  });

  it('takes the question back on `Esc`, and on the way out it offers', () => {
    const refused = {
      kind: 'refused',
      why: 'B5 is filled by a range',
      about: null,
      canOverride: false,
      choices: [],
    } as const;
    const on = asks();
    const into = shown({ refused }, on);

    into
      .querySelector('.over')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(on.stopAsking).toHaveBeenCalled();

    into.querySelector<HTMLElement>('.refused .cancel')?.click();
    expect(on.stopAsking).toHaveBeenCalledTimes(2);
  });

  it('leaves a question that is already being answered alone', () => {
    // A redraw must not take the keyboard back, or the reason being typed.
    const refused = {
      kind: 'refused',
      why: 'B5 is filled by a range',
      about: { kind: 'edit', sheet: 'Sales', row: 5, col: 2, text: '=B1*2' },
      canOverride: true,
      choices: [],
    } as const;
    const on = asks();
    const into = shown({ refused }, on);

    const why = into.querySelector<HTMLInputElement>('.refused .reason');
    if (why === null) throw new Error('nothing to type a reason into');
    why.value = 'this row is counted by hand';

    restate(into, showingOf({ refused }), on);
    expect(into.querySelector<HTMLInputElement>('.refused .reason')?.value).toBe(
      'this row is counted by hand',
    );
    expect(into.querySelectorAll('.over')).toHaveLength(1);
  });

  it('puts the keyboard back on the grid when the question goes', () => {
    // Answered or left, the question is removed with the keyboard inside it —
    // and a grid with no focus answers no key, `Cmd`+`C` among them.
    const refused = {
      kind: 'refused',
      why: 'B5 is filled by a range',
      about: null,
      canOverride: false,
      choices: [],
    } as const;
    const at = { row: 1, col: 1 };
    const on = asks();
    const into = shown({ selected: at, anchor: at, refused }, on);
    expect(into.querySelector('.refused')?.contains(document.activeElement)).toBe(true);

    restate(into, showingOf({ selected: at, anchor: at }), on);
    expect(document.activeElement).toBe(into.querySelector('td[data-at="1:1"]'));
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
    const refused = {
      kind: 'refused',
      why: 'B5 holds a formula',
      about: null,
      canOverride: false,
      choices: [],
    } as const;
    expect(shown({ refused }).querySelector('.refused')?.textContent).toContain('holds a formula');
  });

  it('lists each answer with what it would move, which is what makes it a choice', () => {
    const typed = { sheet: 'Sales', row: 5, col: 2, text: '=B1*2' };
    const refused = {
      kind: 'refused',
      why: 'B5 is filled by a range',
      about: { kind: 'edit', ...typed },
      canOverride: true,
      choices: [
        {
          id: 'rangeFormula',
          what: 'Change the range at B2',
          moves: 4,
          sample: ['B2', 'B3', 'B4'],
        },
      ],
    } as const;
    const on = asks();
    const into = shown({ refused }, on);

    const pick = into.querySelector('.refused .choice');
    expect(pick?.textContent).toBe('Change the range at B2 — 4 cells (B2, B3, B4, …)');

    pick?.dispatchEvent(new MouseEvent('click'));
    expect(on.answer).toHaveBeenCalledWith({ kind: 'edit', ...typed }, 'rangeFormula');
  });

  it('offers the exception where there is a cell it could be about', () => {
    const typed = { sheet: 'Sales', row: 5, col: 2, text: '5' };
    const refused = {
      kind: 'refused',
      why: 'B5 is filled by a range',
      about: { kind: 'edit', ...typed },
      canOverride: true,
      choices: [],
    } as const;
    const on = asks();
    const into = shown({ refused }, on);

    into.querySelector<HTMLElement>('.refused .go')?.click();
    expect(on.overrideWith).toHaveBeenCalledWith({ kind: 'edit', ...typed }, '');
  });

  it('takes the reason from the box beside it, where one was given', () => {
    const typed = { sheet: 'Sales', row: 5, col: 2, text: '5' };
    const refused = {
      kind: 'refused',
      why: 'B5 is filled by a range',
      about: { kind: 'edit', ...typed },
      canOverride: true,
      choices: [],
    } as const;
    const on = asks();
    const into = shown({ refused }, on);

    const why = into.querySelector('.refused .reason');
    if (!(why instanceof HTMLInputElement)) throw new Error('nowhere to say why');

    why.value = 'the audit settled this row';
    into.querySelector<HTMLElement>('.refused .go')?.click();

    expect(on.overrideWith).toHaveBeenCalledWith(
      { kind: 'edit', ...typed },
      'the audit settled this row',
    );
  });

  it('takes Enter in that box as the same answer', () => {
    const typed = { sheet: 'Sales', row: 5, col: 2, text: '5' };
    const refused = {
      kind: 'refused',
      why: 'B5 is filled by a range',
      about: { kind: 'edit', ...typed },
      canOverride: true,
      choices: [],
    } as const;
    const on = asks();
    const into = shown({ refused }, on);

    const why = into.querySelector('.refused .reason');
    if (!(why instanceof HTMLInputElement)) throw new Error('nowhere to say why');

    why.value = 'settled';
    why.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(on.overrideWith).toHaveBeenCalledWith({ kind: 'edit', ...typed }, 'settled');
  });

  it('offers nothing where there is nothing an override could name', () => {
    const refused = {
      kind: 'refused',
      why: 'nothing is written there',
      about: null,
      canOverride: false,
      choices: [],
    } as const;
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

describe('the switches over the grid', () => {
  const state = (selected: Showing['selected']): Showing =>
    showingOf({
      drawing: drawing({ sheets: [sheet({ cells: [cell(1, 1, { value: 'APAC' })] })] }),
      selected,
    });

  it('follow the selection, which arrives after the grid was drawn', () => {
    const into = document.createElement('div');
    // Not the freeze menu, which opens with no cell selected because taking a
    // freeze off is about the sheet; not the decimals, which want one to take.
    const switches = () => [
      ...into.querySelectorAll<HTMLButtonElement>('button.look:not(.freeze):not(.fewer)'),
    ];

    draw(into, state(null), asks());
    expect(switches().every((one) => one.disabled)).toBe(true);

    restate(into, state({ row: 2, col: 2 }), asks());
    expect(switches().some((one) => one.disabled)).toBe(false);
  });

  it('show what the cell now selected wears, not what the last one did', () => {
    const into = document.createElement('div');
    const bold = drawing({
      sheets: [sheet({ cells: [cell(1, 1, { style: { 'font.bold': true } }), cell(2, 1)] })],
    });

    draw(into, { ...state(null), drawing: bold }, asks());
    restate(into, { ...state({ row: 1, col: 1 }), drawing: bold }, asks());
    expect(into.querySelector('.look.bold')?.classList.contains('on')).toBe(true);

    restate(into, { ...state({ row: 2, col: 1 }), drawing: bold }, asks());
    expect(into.querySelector('.look.bold')?.classList.contains('on')).toBe(false);
  });
});

describe('where the paper falls', () => {
  const roomy = { of: { rows: 40, columns: 20 } };

  function paper(print: Partial<NonNullable<Parameters<typeof sheet>[0]>['print']>) {
    const one = { area: null, breaks: [], says: 'said', ...print };
    return shown({ drawing: drawing({ sheets: [sheet({ ...roomy, print: one })] }) });
  }

  it('outlines the print area over the cells it covers', () => {
    const into = paper({ area: { top: 2, left: 2, bottom: 3, right: 3 } });
    const box = into.querySelector<HTMLElement>('.paper .area');
    // The row numbers, then one default column: 8.43 characters of seven
    // pixels and the five a cell keeps around them, which is Excel's 64.
    expect(Math.round(Number.parseFloat(box?.style.left ?? '0'))).toBe(Math.round(44 + 64.01));
    expect(Math.round(Number.parseFloat(box?.style.width ?? '0'))).toBe(128);
  });

  it('draws a line above and left of each page break, and neither at the sheet edge', () => {
    const into = paper({
      breaks: [
        { row: 21, col: 3 },
        { row: 1, col: 1 },
      ],
    });
    expect(into.querySelectorAll('.paper .break.column').length).toBe(1);
    expect(into.querySelectorAll('.paper .break.row').length).toBe(1);
  });

  it('draws nothing where the setup says neither an area nor a break', () => {
    expect(paper({}).querySelector('.paper')).toBeNull();
  });

  it('says the rest of it under the grid, where a line in the sheet cannot', () => {
    const into = paper({ area: { top: 1, left: 1, bottom: 2, right: 2 } });
    expect(into.querySelector('.under')?.textContent).toContain('said');
  });
});

describe('a protected sheet', () => {
  it('marks the cells a style unlocks, and says what the sheet allows', () => {
    const cells = [
      cell(1, 1, { value: 'locked' }),
      cell(2, 1, { value: 'type here', style: { 'protection.locked': false } }),
    ];
    const protect = { says: 'This sheet is locked.' };
    const into = shown({ drawing: drawing({ sheets: [sheet({ cells, protect })] }) });

    expect(into.querySelectorAll('td.unlocked').length).toBe(1);
    expect(into.querySelector('td.unlocked')?.textContent).toBe('type here');
    expect(into.querySelector('.under')?.textContent).toContain('This sheet is locked.');
  });

  it('marks nothing where the sheet is not protected', () => {
    const cells = [cell(1, 1, { style: { 'protection.locked': false } })];
    const into = shown({ drawing: drawing({ sheets: [sheet({ cells })] }) });

    expect(into.querySelectorAll('td.unlocked').length).toBe(0);
  });
});
