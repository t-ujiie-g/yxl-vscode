// @vitest-environment jsdom

import { STYLE_PROPERTIES, type StyleValues } from '@yxl-vscode/spec';
import { describe, expect, it, vi } from 'vitest';
import { cleared, quickly } from './formats';
import { asks, cell, drawing, sheet, showingOf } from './harness';
import type { Asks } from './showing';

/** One cell, selected, wearing this — which is what the controls are drawn from. */
function on(style: StyleValues = {}) {
  return showingOf({
    drawing: drawing({ sheets: [sheet({ cells: [cell(1, 1, { style })] })] }),
    selected: { row: 1, col: 1 },
    anchor: { row: 1, col: 1 },
  });
}

const ONE = { top: 1, left: 1, bottom: 1, right: 1 };

/** The quick controls, by the name each is drawn under. */
function quick(style: StyleValues = {}, wear = vi.fn()) {
  const drawn = quickly(on(style), { ...asks(), wear } as Asks);
  const of = (name: string) =>
    drawn.find((one) => one.classList.contains(name)) as HTMLButtonElement;

  return { of, wear };
}

describe('the percent a reader asks for without opening the box', () => {
  it('sets the format Excel’s own shortcut sets', () => {
    const { of, wear } = quick();

    of('percent').click();
    expect(wear).toHaveBeenCalledWith({ format: '0%' }, ONE);
  });

  it('takes it off again where the cells already have exactly it', () => {
    const { of, wear } = quick({ format: '0%' });

    of('percent').click();
    expect(wear).toHaveBeenCalledWith({ format: null }, ONE);
  });
});

describe('a decimal place more or fewer', () => {
  it('starts a plain number where the cells have no format at all', () => {
    const { of, wear } = quick();

    of('more').click();
    expect(wear).toHaveBeenCalledWith({ format: '0.0' }, ONE);
  });

  it('adds one to what the cells show, keeping the rest of the format', () => {
    const { of, wear } = quick({ format: '#,##0.00' });

    of('more').click();
    expect(wear).toHaveBeenCalledWith({ format: '#,##0.000' }, ONE);
  });

  it('takes one away, and the point with the last of them', () => {
    const { of, wear } = quick({ format: '0.0%' });

    of('fewer').click();
    expect(wear).toHaveBeenCalledWith({ format: '0%' }, ONE);
  });

  it('cannot take one away where the cells show none', () => {
    expect(quick({ format: '#,##0' }).of('fewer').disabled).toBe(true);
    expect(quick({ format: '#,##0.0' }).of('fewer').disabled).toBe(false);
  });

  it('cannot add one past what a format is given here', () => {
    expect(quick({ format: '0.000000000' }).of('more').disabled).toBe(true);
  });

  it('wants a cell to act on, as every look does', () => {
    const drawn = quickly(showingOf(), asks()) as HTMLButtonElement[];

    expect(drawn.every((one) => one.disabled)).toBe(true);
  });
});

describe('taking the whole look off at once', () => {
  it('asks for every property the schema has, each set to nothing', () => {
    const wear = vi.fn();
    const button = cleared(on({ 'font.bold': true }), { ...asks(), wear } as Asks);

    button.click();
    const [want] = wear.mock.calls[0] ?? [];
    expect(Object.keys(want ?? {})).toEqual([...STYLE_PROPERTIES]);
    expect(Object.values(want ?? {}).every((one) => one === null)).toBe(true);
  });

  it('lands on everything the reader has selected', () => {
    const wear = vi.fn();
    const showing = { ...on(), anchor: { row: 3, col: 2 } };

    cleared(showing, { ...asks(), wear } as Asks).click();
    expect(wear.mock.calls[0]?.[1]).toEqual({ top: 1, left: 1, bottom: 3, right: 2 });
  });
});
