// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { type Host, wire } from './index';
import type { Drawing, DrawnCell, DrawnSheet, FromView, Refused, Typed } from './protocol';

function cell(of: Partial<DrawnCell> = {}): DrawnCell {
  return {
    row: 1,
    col: 1,
    value: 'APAC',
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
    of: { rows: 2, columns: 2 },
    widths: [{ first: 1, last: 1, size: 10, hidden: false, group: null }],
    heights: [],
    cells: [cell()],
    merges: [],
    problems: [],
    freeze: null,
    ...of,
  };
}

const drawing: Drawing = {
  kind: 'drawing',
  file: 'spec.yxl.yaml',
  sheets: [sheet()],
  params: [],
  diagnostics: [],
  uncomputed: null,
};

/** The view, wired to a page and a host that only remembers what it was sent. */
function view() {
  const sent: FromView[] = [];
  const host: Host = {
    postMessage: (message) => {
      sent.push(message);
    },
  };

  const into = document.createElement('div');
  document.body.append(into);

  const told = wire(into, host);
  told(drawing);

  return { into, sent, told };
}

function at(into: HTMLElement, row: number, col: number): HTMLTableCellElement | undefined {
  const line = into.querySelectorAll('tbody tr')[row - 1];
  return [...(line?.querySelectorAll('td') ?? [])][col - 1];
}

const typed: Typed = { sheet: 'Sales', row: 1, col: 1, text: '99' };

/** A shortcut held down on a cell, which is where the reader's keyboard is. */
function press(into: HTMLElement, row: number, col: number, key: string): void {
  at(into, row, col)?.dispatchEvent(
    new KeyboardEvent('keydown', { key, metaKey: true, bubbles: true, cancelable: true }),
  );
}

/** Select `from`, then reach to `to` with the shift key, as a reader would. */
function reachFrom(
  into: HTMLElement,
  from: { row: number; col: number },
  to: { row: number; col: number },
): void {
  at(into, from.row, from.col)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  at(into, to.row, to.col)?.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, shiftKey: true }),
  );
}

describe('what the view sends', () => {
  it('sends an edit as an edit, naming the sheet it is showing', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('dblclick'));
    const box = into.querySelector('.typing');
    if (!(box instanceof HTMLTextAreaElement)) throw new Error('nothing to type into');

    box.value = 'EMEA';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(sent.filter((one) => one.kind === 'edit')).toEqual([
      { kind: 'edit', sheet: 'Sales', row: 1, col: 1, text: 'EMEA' },
    ]);
  });

  it('sends the colour picked to the cells the palette was opened over', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    into.querySelector<HTMLButtonElement>('button.look.fill')?.click();
    into.querySelector<HTMLButtonElement>('.panel .swatch[title="#FF9900"]')?.click();

    expect(sent.filter((one) => one.kind === 'wear')).toEqual([
      {
        kind: 'wear',
        sheet: 'Sales',
        top: 1,
        left: 1,
        bottom: 1,
        right: 1,
        want: { fill: 'FF9900' },
        whole: null,
      },
    ]);
  });

  it('closes an open panel on the click that lands anywhere else', () => {
    const { into } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    into.querySelector<HTMLButtonElement>('button.look.fill')?.click();
    expect(into.querySelector('.panel')).not.toBeNull();

    into.querySelector('.scrim')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(into.querySelector('.panel')).toBeNull();
  });

  it('takes the whole column from its heading, and says so with the look it sends', () => {
    const { into, sent } = view();

    into
      .querySelector<HTMLElement>('thead th[data-col="2"]')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    into.querySelector<HTMLButtonElement>('button.look.bold')?.click();

    expect(sent.filter((one) => one.kind === 'wear')).toEqual([
      {
        kind: 'wear',
        sheet: 'Sales',
        top: 1,
        left: 2,
        bottom: 2,
        right: 2,
        want: { 'font.bold': true },
        whole: 'columns',
      },
    ]);
  });

  it('reaches across the headings dragged over, and takes the rows from theirs', () => {
    const { into, sent } = view();
    const at = (col: number) => into.querySelector<HTMLElement>(`thead th[data-col="${col}"]`);

    at(1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    at(2)?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, buttons: 1 }));
    into.querySelector<HTMLButtonElement>('button.look.bold')?.click();

    expect(sent.filter((one) => one.kind === 'wear').at(-1)).toMatchObject({
      left: 1,
      right: 2,
      whole: 'columns',
    });

    into
      .querySelector<HTMLElement>('tbody th[data-row="2"]')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    into.querySelector<HTMLButtonElement>('button.look.bold')?.click();

    expect(sent.filter((one) => one.kind === 'wear').at(-1)).toMatchObject({
      top: 2,
      bottom: 2,
      left: 1,
      right: 2,
      whole: 'rows',
    });
  });

  it('is cells again once a cell is clicked, so a look lands where it was asked', () => {
    const { into, sent } = view();

    into
      .querySelector<HTMLElement>('thead th[data-col="1"]')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    into.querySelector<HTMLButtonElement>('button.look.bold')?.click();

    expect(sent.filter((one) => one.kind === 'wear').at(-1)).toMatchObject({ whole: null });
  });

  it('asks what a rectangle comes to, and says it under the grid', () => {
    const { into, sent, told } = view();

    reachFrom(into, { row: 1, col: 1 }, { row: 2, col: 2 });
    expect(sent.filter((one) => one.kind === 'sum')).toEqual([
      { kind: 'sum', sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 2 },
    ]);

    told({ kind: 'summed', sheet: 'Sales', held: 3, numbers: 2, sum: 30 });
    expect(into.querySelector('.comes')?.textContent).toBe('Sum 30   Average 15   Count 3');
  });

  it('says nothing of the sort about one cell, which comes to itself', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(sent.filter((one) => one.kind === 'sum')).toEqual([]);
    expect(into.querySelector('.comes')).toBeNull();
  });

  it('puts it away when the selection becomes one cell again', () => {
    const { into, told } = view();

    reachFrom(into, { row: 1, col: 1 }, { row: 2, col: 2 });
    told({ kind: 'summed', sheet: 'Sales', held: 3, numbers: 2, sum: 30 });
    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(into.querySelector('.comes')).toBeNull();
  });

  it('says only the count where nothing in the rectangle is a number', () => {
    const { into, told } = view();

    reachFrom(into, { row: 1, col: 1 }, { row: 2, col: 2 });
    told({ kind: 'summed', sheet: 'Sales', held: 2, numbers: 0, sum: 0 });

    expect(into.querySelector('.comes')?.textContent).toBe('Count 2');
  });

  it('sends a column dragged by its edge, in the units a spec writes widths in', () => {
    const { into, sent } = view();

    const grip = into.querySelector('thead .grip.column');
    if (grip === null) throw new Error('there is no grip to drag');

    grip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 114 }));
    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(sent.filter((one) => one.kind === 'resize')).toEqual([
      { kind: 'resize', sheet: 'Sales', axis: 'column', first: 1, last: 1, size: 12 },
    ]);
  });

  it('sizes every column the reader took by its heading, when one of them is dragged', () => {
    const { into, sent } = view();
    const at = (col: number) => into.querySelector<HTMLElement>(`thead th[data-col="${col}"]`);

    at(1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    at(2)?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, buttons: 1 }));

    const grip = at(2)?.querySelector('.grip.column');
    grip?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 114 }));
    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(sent.filter((one) => one.kind === 'resize').at(-1)).toMatchObject({
      first: 1,
      last: 2,
    });
  });

  it('sizes the one dragged where it is outside what was selected', () => {
    const { into, sent } = view();
    const at = (col: number) => into.querySelector<HTMLElement>(`thead th[data-col="${col}"]`);

    at(1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    const grip = at(2)?.querySelector('.grip.column');
    grip?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 114 }));
    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(sent.filter((one) => one.kind === 'resize').at(-1)).toMatchObject({
      first: 2,
      last: 2,
    });
  });

  it('asks the host for what a column holds when its edge is double-clicked', () => {
    const { into, sent } = view();

    into
      .querySelector('thead th[data-col="1"] .grip.column')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(sent.filter((one) => one.kind === 'fit')).toEqual([
      { kind: 'fit', sheet: 'Sales', axis: 'column', at: 1 },
    ]);
  });

  it('sends nothing back for a fit it cannot measure, rather than a width of nothing', () => {
    // jsdom has no canvas, which is the same answer an old shell would give.
    const { into, sent, told } = view();

    into
      .querySelector('thead th[data-col="1"] .grip.column')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    told({ kind: 'fitting', sheet: 'Sales', axis: 'column', at: 1, cells: [] });

    expect(sent.filter((one) => one.kind === 'resize')).toEqual([]);
  });

  it('sends nothing where the edge was pressed and let go without moving', () => {
    const { into, sent } = view();

    const grip = into.querySelector('thead .grip.column');
    grip?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(sent.filter((one) => one.kind === 'resize')).toEqual([]);
  });

  it('sends a row dragged by its edge, in points', () => {
    const { into, sent } = view();

    const grip = into.querySelector('tbody .grip.row');
    grip?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 50 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 70 }));
    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(sent.filter((one) => one.kind === 'resize')).toEqual([
      { kind: 'resize', sheet: 'Sales', axis: 'row', first: 1, last: 1, size: 30 },
    ]);
  });

  it('sends an override as an override, whatever the offer arrived carrying', () => {
    // The offer comes back from the host, and a message carries its own `kind`.
    // Spread into the next one it overwrote it, and the override went out as
    // the edit it was the exception to — refused by the rule it excepted.
    const { into, sent, told } = view();
    const refused: Refused = {
      kind: 'refused',
      why: 'filled by a range',
      about: { kind: 'edit', ...typed },
      canOverride: true,
      choices: [],
    };

    told(refused);
    into.querySelector<HTMLElement>('.refused .go')?.click();

    expect(sent.filter((one) => one.kind === 'override')).toEqual([
      { kind: 'override', sheet: 'Sales', row: 1, col: 1, text: '99', reason: '' },
    ]);
  });

  it('sends a chosen answer as the message it was refused, with the answer on it', () => {
    const { into, sent, told } = view();
    const choices = [{ id: 'rangeFormula', what: 'Change the range', moves: 2, sample: ['C2'] }];

    told({
      kind: 'refused',
      why: 'filled by a range',
      about: { kind: 'edit', ...typed },
      canOverride: true,
      choices,
    });
    into.querySelector<HTMLElement>('.refused .choice')?.click();

    expect(sent.filter((one) => one.kind === 'edit')).toEqual([
      { kind: 'edit', sheet: 'Sales', row: 1, col: 1, text: '99', choice: 'rangeFormula' },
    ]);
  });

  it('sends the reason typed beside the offer', () => {
    const { into, sent, told } = view();
    told({
      kind: 'refused',
      why: 'filled by a range',
      about: { kind: 'edit', ...typed },
      canOverride: true,
      choices: [],
    });

    const why = into.querySelector('.refused .reason');
    if (!(why instanceof HTMLInputElement)) throw new Error('nowhere to say why');

    why.value = 'the audit settled this row';
    into.querySelector<HTMLElement>('.refused .go')?.click();

    expect(sent.at(-1)).toMatchObject({ kind: 'override', reason: 'the audit settled this row' });
  });
});

describe('what the view does with what it is told', () => {
  it('says what the host said, where the reader asked', () => {
    const { into, told } = view();
    told({ kind: 'said', text: 'Sales!C3 is now written as an override.' });

    expect(into.textContent).toContain('written as an override');
  });

  it('puts a refused edit back on the cell it was typed into', () => {
    // Enter moves down; an edit that did not happen should not move the reader
    // away from the cell it was about.
    const { into, told } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('dblclick'));
    const box = into.querySelector('.typing');
    if (!(box instanceof HTMLTextAreaElement)) throw new Error('nothing to type into');
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    told({
      kind: 'refused',
      why: 'filled by a range',
      about: null,
      canOverride: false,
      choices: [],
    });
    expect(at(into, 1, 1)?.classList.contains('selected')).toBe(true);
  });

  it('puts the selection back as one cell, not stretched to where Enter went', () => {
    // Enter moves down before the answer arrives, so a refusal that puts the
    // reader back has to take the other corner of the range with it.
    const { into, told } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('dblclick'));
    const box = into.querySelector('.typing');
    if (!(box instanceof HTMLTextAreaElement)) throw new Error('nothing to type into');
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    told({
      kind: 'refused',
      why: 'filled by a range',
      about: null,
      canOverride: false,
      choices: [],
    });

    expect(at(into, 1, 1)?.classList.contains('selected')).toBe(true);
    expect(into.querySelector('td.ranged')).toBeNull();
  });

  it('says nothing about a cursor that reaches nothing at all', () => {
    const { into, told } = view();
    told({ kind: 'highlighted', says: '', cells: [] });

    expect(into.querySelector('.reaching')).toBeNull();
  });

  it('forgets a refusal once the spec has been read again', () => {
    const { into, told } = view();
    told({
      kind: 'refused',
      why: 'filled by a range',
      about: null,
      canOverride: false,
      choices: [],
    });
    told(drawing);

    expect(into.querySelector('.refused')).toBeNull();
  });
});

describe('emptying what is selected', () => {
  const wide: Drawing = {
    ...drawing,
    sheets: [
      sheet({
        rows: 4,
        columns: 4,
        of: { rows: 4, columns: 4 },
        cells: [cell(), cell({ row: 2, col: 2 }), cell({ row: 3, col: 3 })],
      }),
    ],
  };

  it('sends one cell as an edit of nothing, which is what typing nothing is', () => {
    const { into, sent, told } = view();
    told(wide);

    at(into, 2, 2)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    at(into, 2, 2)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

    expect(sent.filter((one) => one.kind === 'edit')).toEqual([
      { kind: 'edit', sheet: 'Sales', row: 2, col: 2, text: '' },
    ]);
  });

  it('sends the rectangle as it stands now, not as it stood when the grid was drawn', () => {
    const { into, sent, told } = view();
    told(wide);

    // Selecting restates the grid rather than redrawing it, so a rectangle read
    // off what the cells were drawn with is the selection before this one.
    reachFrom(into, { row: 1, col: 1 }, { row: 2, col: 2 });
    reachFrom(into, { row: 2, col: 2 }, { row: 3, col: 3 });
    at(into, 3, 3)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

    expect(sent.filter((one) => one.kind === 'empty')).toEqual([
      { kind: 'empty', sheet: 'Sales', top: 2, left: 2, bottom: 3, right: 3 },
    ]);
  });
});

describe('taking an edit back from the grid', () => {
  it('asks the host for it: the stack that holds the edit is the file own', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    at(into, 1, 1)?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true }),
    );

    expect(sent.filter((one) => one.kind === 'undo')).toEqual([{ kind: 'undo', redo: false }]);
  });

  it('asks for the redo where the reader held shift', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    at(into, 1, 1)?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Z', metaKey: true, shiftKey: true, bubbles: true }),
    );

    expect(sent.filter((one) => one.kind === 'undo')).toEqual([{ kind: 'undo', redo: true }]);
  });

  it('takes the keyboard back when the host says it had to move it', () => {
    const { into, told } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    (document.activeElement as HTMLElement | null)?.blur();
    told({ kind: 'focus' });

    expect(document.activeElement?.getAttribute('data-at')).toBe('1:1');
  });
});

describe('an answer offered about a rectangle', () => {
  const held: Refused = {
    kind: 'refused',
    why: '2 of the 4 cells here cannot be emptied, so none were',
    about: { kind: 'empty', sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 2 },
    canOverride: false,
    choices: [{ id: 'only', what: 'Empty the ones that can be', moves: 2, sample: ['Sales!A1'] }],
  };

  it('goes back naming the rectangle it was about', () => {
    const { into, sent, told } = view();
    told(held);

    into.querySelector<HTMLElement>('.refused .choice')?.click();

    expect(sent.filter((one) => one.kind === 'empty')).toEqual([
      { kind: 'empty', sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 2, choice: 'only' },
    ]);
  });

  it('offers no override: a rectangle is not one cell to except', () => {
    const { into, told } = view();
    told(held);

    expect(into.querySelector('.refused .go')).toBeNull();
  });
});

describe('a rectangle copied in the grid', () => {
  /** Press a key on the cell the reader is on, as the grid receives one. */
  const press = (into: HTMLElement, row: number, col: number, key: string) => {
    at(into, row, col)?.dispatchEvent(
      new KeyboardEvent('keydown', { key, metaKey: true, bubbles: true }),
    );
  };

  it('sends nothing until it is put down', () => {
    const { into, sent } = view();

    reachFrom(into, { row: 1, col: 1 }, { row: 2, col: 2 });
    press(into, 2, 2, 'c');

    expect(sent.filter((one) => one.kind === 'pasteAt')).toEqual([]);
  });

  it('marks the cells it holds, on the sheet they are on', () => {
    const { into } = view();

    reachFrom(into, { row: 1, col: 1 }, { row: 2, col: 2 });
    press(into, 2, 2, 'c');

    expect(into.querySelectorAll('td.copied')).toHaveLength(4);
  });
});

describe('a rectangle copied out of the grid', () => {
  it('puts what the reader was shown on the system clipboard, in both flavours', () => {
    const wrote: Record<string, string> = {};
    document.execCommand = () => {
      const event = new Event('copy');
      Object.defineProperty(event, 'clipboardData', {
        value: {
          setData: (kind: string, text: string) => {
            wrote[kind] = text;
          },
        },
      });
      document.dispatchEvent(event);
      return true;
    };

    const { into } = view();
    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    at(into, 1, 1)?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }),
    );

    expect(wrote['text/plain']).toBe('APAC');
    expect(wrote['text/html']).toBe('<table><tr><td>APAC</td></tr></table>');
  });
});

describe('a paste the grid asks the host to make', () => {
  const press = (into: HTMLElement, row: number, col: number, key: string) => {
    at(into, row, col)?.dispatchEvent(
      new KeyboardEvent('keydown', { key, metaKey: true, bubbles: true }),
    );
  };

  it('names where it is going, with nothing of its own to put there', () => {
    const { into, sent } = view();

    press(into, 2, 1, 'v');
    expect(sent.filter((one) => one.kind === 'pasteAt')).toEqual([
      { kind: 'pasteAt', sheet: 'Sales', row: 2, col: 1, from: null, cut: false, ours: null },
    ]);
  });

  it('names the rectangle it copied, so the host can tell the two pastes apart', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    press(into, 1, 1, 'c');
    press(into, 2, 2, 'v');

    expect(sent.filter((one) => one.kind === 'pasteAt')[0]).toMatchObject({
      from: { sheet: 'Sales', top: 1, left: 1, bottom: 1, right: 1 },
      cut: false,
      row: 2,
      col: 2,
    });
  });

  it('says a cut is a cut', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    press(into, 1, 1, 'x');
    press(into, 2, 2, 'v');

    expect(sent.filter((one) => one.kind === 'pasteAt')[0]).toMatchObject({ cut: true });
  });
});

describe('looking for something in the sheet', () => {
  const press = (into: HTMLElement, row: number, col: number, key: string, shift = false) => {
    at(into, row, col)?.dispatchEvent(
      new KeyboardEvent('keydown', { key, metaKey: true, shiftKey: shift, bubbles: true }),
    );
  };

  const box = (into: HTMLElement) => into.querySelector<HTMLInputElement>('.looking .for');

  it('opens a box on the key every spreadsheet opens one on', () => {
    const { into } = view();

    press(into, 1, 1, 'f');
    expect(box(into)).not.toBeNull();
  });

  it('asks the host, which is the only one that can see past the drawn window', () => {
    const { into, sent } = view();

    press(into, 1, 1, 'f');
    const typing = box(into);
    if (typing === null) throw new Error('no box to type in');

    typing.value = 'APAC';
    typing.dispatchEvent(new Event('input'));

    expect(sent.filter((one) => one.kind === 'find')).toEqual([
      { kind: 'find', sheet: 'Sales', text: '' },
      { kind: 'find', sheet: 'Sales', text: 'APAC' },
    ]);
  });

  it('marks what came back and goes to the first of it', () => {
    const { into, told } = view();

    press(into, 1, 1, 'f');
    told({ kind: 'found', sheet: 'Sales', text: '', cells: [{ row: 2, col: 2 }] });

    expect(into.querySelectorAll('td.found')).toHaveLength(1);
    expect(into.querySelector('.looking .count')?.textContent).toBe('1 of 1');
    expect(into.querySelector('td.selected')?.getAttribute('data-at')).toBe('2:2');
  });

  it('goes round what it found, forwards and back', () => {
    const { into, told } = view();

    press(into, 1, 1, 'f');
    told({
      kind: 'found',
      sheet: 'Sales',
      text: '',
      cells: [
        { row: 1, col: 1 },
        { row: 2, col: 2 },
      ],
    });

    press(into, 1, 1, 'g');
    expect(into.querySelector('.looking .count')?.textContent).toBe('2 of 2');

    press(into, 2, 2, 'g');
    expect(into.querySelector('.looking .count')?.textContent).toBe('1 of 2');

    press(into, 1, 1, 'g', true);
    expect(into.querySelector('.looking .count')?.textContent).toBe('2 of 2');
  });

  it('says so where the sheet holds none of it', () => {
    const { into, told } = view();

    press(into, 1, 1, 'f');
    const typing = box(into);
    if (typing === null) throw new Error('no box to type in');

    typing.value = 'LATAM';
    typing.dispatchEvent(new Event('input'));
    told({ kind: 'found', sheet: 'Sales', text: 'LATAM', cells: [] });

    expect(into.querySelector('.looking .count')?.textContent).toBe('nothing here holds that');
  });

  it('goes on through what it found from inside the box the reader is typing in', () => {
    const { into, told } = view();

    press(into, 1, 1, 'f');
    told({
      kind: 'found',
      sheet: 'Sales',
      text: '',
      cells: [
        { row: 1, col: 1 },
        { row: 2, col: 2 },
      ],
    });

    const typing = box(into);
    if (typing === null) throw new Error('no box to type in');

    typing.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', metaKey: true, bubbles: true }));
    expect(into.querySelector('.looking .count')?.textContent).toBe('2 of 2');
  });

  it('brings what it goes to into view, which selecting it does not do', () => {
    const seen: { at: string | null; how: unknown }[] = [];
    // On the prototype, because the cell the search lands on is drawn after
    // the box that starts it.
    HTMLTableCellElement.prototype.scrollIntoView = function into_(how?: unknown) {
      seen.push({ at: this.getAttribute('data-at'), how });
    };

    const { into, told } = view();
    press(into, 1, 1, 'f');
    told({ kind: 'found', sheet: 'Sales', text: '', cells: [{ row: 2, col: 2 }] });

    expect(seen).toEqual([{ at: '2:2', how: { block: 'nearest', inline: 'nearest' } }]);
  });

  it('asks for the window where what it found is past the one drawn', () => {
    const { into, sent, told } = view();

    told({
      ...drawing,
      sheets: [{ ...sheet(), rows: 2, columns: 2, of: { rows: 400, columns: 4 } }],
    });
    press(into, 1, 1, 'f');
    told({ kind: 'found', sheet: 'Sales', text: '', cells: [{ row: 300, col: 2 }] });

    expect(sent.filter((one) => one.kind === 'window')).toEqual([
      { kind: 'window', sheet: 'Sales', row: 300, col: 2 },
    ]);
  });

  it('leaves the keyboard alone for a drawing it did not ask for', () => {
    // The reader is editing the YAML with the find bar open: every keystroke
    // redraws the preview, and none of them is theirs to be taken away from.
    const { into, told } = view();

    press(into, 1, 1, 'f');
    const typing = box(into);
    if (typing === null) throw new Error('no box to type in');

    typing.blur();
    told(drawing);

    expect(document.activeElement).not.toBe(into.querySelector('.looking .for'));
  });

  it('takes an answer for a search the reader has already moved on from', () => {
    const { into, told } = view();

    press(into, 1, 1, 'f');
    told({ kind: 'found', sheet: 'Sales', text: 'stale', cells: [{ row: 2, col: 2 }] });

    expect(into.querySelectorAll('td.found')).toHaveLength(0);
  });
});

describe('the bar over the grid', () => {
  const address = (into: HTMLElement) => into.querySelector<HTMLInputElement>('.formula .address');
  const holds = (into: HTMLElement) => into.querySelector<HTMLInputElement>('.formula .holds');

  it('shows the address of the cell the reader is on', () => {
    const { into } = view();

    at(into, 2, 2)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(address(into)?.value).toBe('B2');
  });

  it('goes to the address that is typed into it', () => {
    const { into } = view();

    const box = address(into);
    if (box === null) throw new Error('no address box');

    box.value = 'b2';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(into.querySelector('td.selected')?.getAttribute('data-at')).toBe('2:2');
  });

  it('says so for something that is not an address', () => {
    const { into } = view();

    const box = address(into);
    if (box === null) throw new Error('no address box');

    box.value = 'nowhere';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(into.querySelector('.under')?.textContent).toContain('is not an address');
  });

  it('shows what the cell holds, and nothing where no cell is selected', () => {
    const { into } = view();
    expect(holds(into)?.disabled).toBe(true);

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(holds(into)?.value).toBe('APAC');
    expect(holds(into)?.disabled).toBe(false);
  });

  it('sends what is typed into it as an edit to that cell', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const box = holds(into);
    if (box === null) throw new Error('nothing to type into');

    box.value = '=SUM(B1:B2)';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(sent.filter((one) => one.kind === 'edit')).toEqual([
      { kind: 'edit', sheet: 'Sales', row: 1, col: 1, text: '=SUM(B1:B2)' },
    ]);
  });

  it('puts back what the cell holds on `Esc`, having sent nothing', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const box = holds(into);
    if (box === null) throw new Error('nothing to type into');

    box.value = 'gone';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(box.value).toBe('APAC');
    expect(sent.filter((one) => one.kind === 'edit')).toEqual([]);
  });

  it('takes the whole sheet on `Cmd`+`A` wherever the keyboard is, and not the panel round it', () => {
    const { into, sent } = view();
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    // On the corner button, which is where the reader's keyboard is after
    // clicking it — and where the browser's own select-all took the panel.
    into.querySelector<HTMLButtonElement>('.corner .all')?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(sent.filter((one) => one.kind === 'inspect').at(-1)).toMatchObject({ row: 1, col: 1 });
  });

  it('leaves `Cmd`+`A` to the box the reader is typing in', () => {
    const { into } = view();
    const box = into.querySelector<HTMLInputElement>('.formula .holds');
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    box?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('puts a look on with `Cmd`+`B`, exactly as the toolbar switch does', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    press(into, 1, 1, 'b');

    expect(sent.filter((one) => one.kind === 'wear')).toEqual([
      {
        kind: 'wear',
        sheet: 'Sales',
        top: 1,
        left: 1,
        bottom: 1,
        right: 1,
        want: { 'font.bold': true },
        whole: null,
      },
    ]);
  });

  it('answers them after a whole column is taken from its heading', () => {
    const { into, sent } = view();

    into
      .querySelector<HTMLElement>('thead th[data-col="2"]')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    // The keyboard is on the grid, which is what a heading click used to lose.
    const on = document.activeElement;
    expect(into.contains(on)).toBe(true);

    on?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true, cancelable: true }),
    );

    expect(sent.filter((one) => one.kind === 'wear').at(-1)).toMatchObject({
      top: 1,
      left: 2,
      bottom: 2,
      right: 2,
      want: { 'font.bold': true },
      whole: 'columns',
    });
  });

  it('answers them from the heading itself, where the cell it starts at is not drawn', () => {
    const { into, sent, told } = view();
    told({ ...drawing, sheets: [sheet({ at: { row: 5, col: 1 }, of: { rows: 20, columns: 2 } })] });

    const heading = into.querySelector<HTMLElement>('thead th[data-col="2"]');
    heading?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(document.activeElement).toBe(heading);

    heading?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true, cancelable: true }),
    );

    expect(sent.filter((one) => one.kind === 'wear').at(-1)).toMatchObject({ whole: 'columns' });
  });

  it('takes it off again where the cell wears it already', () => {
    const { into, sent, told } = view();
    told({ ...drawing, sheets: [sheet({ cells: [cell({ style: { 'font.bold': true } })] })] });

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    press(into, 1, 1, 'b');

    expect(sent.filter((one) => one.kind === 'wear').at(-1)).toMatchObject({
      want: { 'font.bold': false },
    });
  });

  it('takes the whole reach with it, as the switch above it would', () => {
    const { into, sent } = view();

    reachFrom(into, { row: 1, col: 1 }, { row: 2, col: 2 });
    press(into, 2, 2, 'i');

    expect(sent.filter((one) => one.kind === 'wear').at(-1)).toMatchObject({
      top: 1,
      left: 1,
      bottom: 2,
      right: 2,
      want: { 'font.italic': true },
    });
  });

  it('leaves the look keys to the box the reader is typing in', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    at(into, 1, 1)?.dispatchEvent(new MouseEvent('dblclick'));
    const box = into.querySelector('.typing');
    if (!(box instanceof HTMLTextAreaElement)) throw new Error('nothing to type into');

    const event = new KeyboardEvent('keydown', {
      key: 'b',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    box.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(sent.filter((one) => one.kind === 'wear')).toEqual([]);
  });

  it('keeps a selection reached with `Shift`+arrow when the right button lands inside it', () => {
    const { into } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    at(into, 1, 1)?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
    );
    expect(into.querySelectorAll('td.ranged')).toHaveLength(2);

    // The grid was drawn before any of that, so only the view knows the reach.
    at(into, 1, 2)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    at(into, 1, 2)?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );

    expect(into.querySelector('.menu.pointed')).not.toBeNull();
    expect(into.querySelectorAll('td.ranged')).toHaveLength(2);
  });

  it('takes the cell the right button lands on outside the selection', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    at(into, 2, 2)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    at(into, 2, 2)?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );

    expect(sent.filter((one) => one.kind === 'inspect').at(-1)).toMatchObject({ row: 2, col: 2 });
    expect(into.querySelector('td.selected')?.getAttribute('data-at')).toBe('2:2');
  });

  it('keeps a run of columns when the right button lands on one of their headings', () => {
    const { into, sent } = view();
    const heading = (col: number) => into.querySelector<HTMLElement>(`thead th[data-col="${col}"]`);

    heading(1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    heading(2)?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, buttons: 1 }));
    heading(2)?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    const entries = [...into.querySelectorAll<HTMLButtonElement>('.pointed .entry')];
    entries.find((one) => one.textContent?.startsWith('Hide'))?.click();
    expect(sent.filter((one) => one.kind === 'hide').at(-1)).toMatchObject({ first: 1, last: 2 });
  });

  it('opens the search on what it already holds, not on what the grid was drawn with', () => {
    const { into, sent } = view();
    const box = () => into.querySelector<HTMLInputElement>('.looking .for');

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    at(into, 1, 1)?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true }),
    );

    const asked = box();
    if (asked === null) throw new Error('the search did not open');
    asked.value = 'APAC';
    asked.dispatchEvent(new Event('input'));

    // The grid was drawn before any of that: only the view knows the text now.
    at(into, 1, 1)?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true }),
    );

    expect(sent.filter((one) => one.kind === 'find').at(-1)).toMatchObject({ text: 'APAC' });
  });

  it('asks to keep a rectangle of rows as a table', () => {
    const { into, sent } = view();

    reachFrom(into, { row: 1, col: 1 }, { row: 2, col: 2 });
    at(into, 2, 2)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    at(into, 2, 2)?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );

    const entries = [...into.querySelectorAll<HTMLButtonElement>('.pointed .entry')];
    entries.find((one) => one.textContent === 'Make this a data table')?.click();

    expect(sent.filter((one) => one.kind === 'table')).toEqual([
      { kind: 'table', sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 2 },
    ]);
  });

  it('asks for a merge over the rectangle the reader has selected', () => {
    const { into, sent } = view();

    reachFrom(into, { row: 1, col: 1 }, { row: 2, col: 2 });
    at(into, 2, 2)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    at(into, 2, 2)?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );

    const entries = [...into.querySelectorAll<HTMLButtonElement>('.pointed .entry')];
    const merge = entries.find((one) => one.textContent === 'Merge cells');

    merge?.click();
    expect(sent.filter((one) => one.kind === 'merge')).toEqual([
      { kind: 'merge', sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 2, merged: true },
    ]);
  });

  it('offers to take one apart where the cell is inside one', () => {
    const { into, sent, told } = view();
    told({ ...drawing, sheets: [sheet({ merges: [{ top: 1, left: 1, bottom: 1, right: 2 }] })] });

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    at(into, 1, 1)?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
    );

    const entries = [...into.querySelectorAll<HTMLButtonElement>('.pointed .entry')];
    expect(entries[0]?.textContent).toBe('Unmerge cells');

    entries[0]?.click();
    expect(sent.filter((one) => one.kind === 'merge').at(-1)).toMatchObject({ merged: false });
  });

  it('takes the whole sheet from the corner, as whole columns', () => {
    const { into, sent } = view();

    into.querySelector<HTMLButtonElement>('.corner .all')?.click();
    into.querySelector<HTMLButtonElement>('button.look.bold')?.click();

    expect(sent.filter((one) => one.kind === 'wear').at(-1)).toMatchObject({
      top: 1,
      left: 1,
      bottom: 2,
      right: 2,
      whole: 'columns',
    });
  });
});
