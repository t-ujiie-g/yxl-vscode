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
    const refused: Refused = { kind: 'refused', why: 'filled by a range', override: offer };

    told(refused);
    into.querySelector<HTMLElement>('.refused .go')?.click();

    expect(sent.filter((one) => one.kind === 'override')).toEqual([
      { kind: 'override', sheet: 'Sales', row: 1, col: 1, text: '99', reason: '' },
    ]);
  });

  it('sends the reason typed beside the offer', () => {
    const { into, sent, told } = view();
    told({ kind: 'refused', why: 'filled by a range', override: typed });

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

    told({ kind: 'refused', why: 'filled by a range', override: null });
    expect(at(into, 1, 1)?.classList.contains('selected')).toBe(true);
  });

  it('says nothing about a cursor that reaches nothing at all', () => {
    const { into, told } = view();
    told({ kind: 'highlighted', says: '', cells: [] });

    expect(into.querySelector('.reaching')).toBeNull();
  });

  it('forgets a refusal once the spec has been read again', () => {
    const { into, told } = view();
    told({ kind: 'refused', why: 'filled by a range', override: null });
    told(drawing);

    expect(into.querySelector('.refused')).toBeNull();
  });
});
