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
    widths: [],
    heights: [],
    cells: [cell()],
    merges: [],
    problems: [],
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
    if (!(box instanceof HTMLInputElement)) throw new Error('nothing to type into');

    box.value = 'EMEA';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(sent.filter((one) => one.kind === 'edit')).toEqual([
      { kind: 'edit', sheet: 'Sales', row: 1, col: 1, text: 'EMEA' },
    ]);
  });

  it('sends an override as an override, whatever the offer arrived carrying', () => {
    // The offer comes back from the host, and a message carries its own `kind`.
    // Spread into the next one it overwrote it, and the override went out as
    // the edit it was the exception to — refused by the rule it excepted.
    const { into, sent, told } = view();
    const offer = { ...typed, kind: 'edit' } as unknown as Typed;
    const refused: Refused = {
      kind: 'refused',
      why: 'filled by a range',
      typed: offer,
      ranged: null,
      pasted: null,
      canOverride: true,
      choices: [],
    };

    told(refused);
    into.querySelector<HTMLElement>('.refused .go')?.click();

    expect(sent.filter((one) => one.kind === 'override')).toEqual([
      { kind: 'override', sheet: 'Sales', row: 1, col: 1, text: '99', reason: '' },
    ]);
  });

  it('sends a chosen answer as a resolution, naming the answer and not the edit', () => {
    const { into, sent, told } = view();
    const choices = [{ id: 'rangeFormula', what: 'Change the range', moves: 2, sample: ['C2'] }];

    told({
      kind: 'refused',
      why: 'filled by a range',
      typed,
      ranged: null,
      pasted: null,
      canOverride: true,
      choices,
    });
    into.querySelector<HTMLElement>('.refused .choice')?.click();

    expect(sent.filter((one) => one.kind === 'resolve')).toEqual([
      { kind: 'resolve', sheet: 'Sales', row: 1, col: 1, text: '99', choice: 'rangeFormula' },
    ]);
  });

  it('sends the reason typed beside the offer', () => {
    const { into, sent, told } = view();
    told({
      kind: 'refused',
      why: 'filled by a range',
      typed,
      ranged: null,
      pasted: null,
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
    if (!(box instanceof HTMLInputElement)) throw new Error('nothing to type into');
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    told({
      kind: 'refused',
      why: 'filled by a range',
      typed: null,
      ranged: null,
      pasted: null,
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
    if (!(box instanceof HTMLInputElement)) throw new Error('nothing to type into');
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    told({
      kind: 'refused',
      why: 'filled by a range',
      typed: null,
      ranged: null,
      pasted: null,
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
      typed: null,
      ranged: null,
      pasted: null,
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
    typed: null,
    pasted: null,
    ranged: { sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 2 },
    canOverride: false,
    choices: [{ id: 'only', what: 'Empty the ones that can be', moves: 2, sample: ['Sales!A1'] }],
  };

  it('goes back naming the rectangle it was about', () => {
    const { into, sent, told } = view();
    told(held);

    into.querySelector<HTMLElement>('.refused .choice')?.click();

    expect(sent.filter((one) => one.kind === 'emptied')).toEqual([
      { kind: 'emptied', sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 2, choice: 'only' },
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

    expect(sent.filter((one) => one.kind === 'paste')).toEqual([]);
  });

  it('marks the cells it holds, on the sheet they are on', () => {
    const { into } = view();

    reachFrom(into, { row: 1, col: 1 }, { row: 2, col: 2 });
    press(into, 2, 2, 'c');

    expect(into.querySelectorAll('td.copied')).toHaveLength(4);
  });

  it('names the rectangle and where it is going', () => {
    const { into, sent } = view();

    reachFrom(into, { row: 1, col: 1 }, { row: 2, col: 2 });
    press(into, 2, 2, 'c');
    press(into, 1, 2, 'v');

    expect(sent.filter((one) => one.kind === 'paste')).toEqual([
      {
        kind: 'paste',
        from: { sheet: 'Sales', top: 1, left: 1, bottom: 2, right: 2 },
        sheet: 'Sales',
        row: 1,
        col: 2,
        cut: false,
      },
    ]);
  });

  it('takes one cell as a rectangle of one', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    press(into, 1, 1, 'c');
    press(into, 2, 2, 'v');

    expect(sent.filter((one) => one.kind === 'paste')[0]).toMatchObject({
      from: { sheet: 'Sales', top: 1, left: 1, bottom: 1, right: 1 },
      row: 2,
      col: 2,
    });
  });

  it('says a cut is a cut, and puts nothing down until it is asked to', () => {
    const { into, sent } = view();

    reachFrom(into, { row: 1, col: 1 }, { row: 1, col: 2 });
    press(into, 1, 2, 'x');
    expect(sent.filter((one) => one.kind === 'paste')).toEqual([]);

    press(into, 2, 1, 'v');
    expect(sent.filter((one) => one.kind === 'paste')[0]).toMatchObject({ cut: true });
  });

  it('puts nothing down where nothing was copied', () => {
    const { into, sent } = view();

    at(into, 1, 1)?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    press(into, 1, 1, 'v');

    expect(sent.filter((one) => one.kind === 'paste')).toEqual([]);
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
