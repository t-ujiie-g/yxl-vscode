// @vitest-environment jsdom

import type { StyleValues } from '@yxl-vscode/spec';
import { describe, expect, it, vi } from 'vitest';
import { faces, sizes } from './fonts';
import { asks, cell, drawing, sheet, showingOf } from './harness';
import type { Asks } from './showing';

/** One cell, selected, wearing this — which is what the boxes are drawn from. */
function on(style: StyleValues = {}) {
  return showingOf({
    drawing: drawing({ sheets: [sheet({ cells: [cell(1, 1, { style })] })] }),
    selected: { row: 1, col: 1 },
    anchor: { row: 1, col: 1 },
  });
}

const ONE = { top: 1, left: 1, bottom: 1, right: 1 };

const box = (of: HTMLElement) => of.querySelector('select') as HTMLSelectElement;

/** The box, changed to that value as a reader picking from it would. */
function picked(of: HTMLElement, value: string): void {
  const select = box(of);
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

describe('the face the cells are set in', () => {
  it('is the workbook’s own where the cells name none', () => {
    expect(box(faces(on(), asks())).value).toBe('');
    expect([...box(faces(on(), asks())).options][0]?.textContent).toBe('Default');
  });

  it('is what the cells wear, where that is one of the offered', () => {
    expect(box(faces(on({ 'font.name': 'Calibri' }), asks())).value).toBe('Calibri');
  });

  it('keeps a face it does not offer rather than losing it', () => {
    const drawn = faces(on({ 'font.name': 'Comic Sans MS' }), asks());
    const named = [...box(drawn).options].map((one) => one.value);

    expect(box(drawn).value).toBe('Comic Sans MS');
    expect(named.at(-1)).toBe('Comic Sans MS');
  });

  it('asks for the face picked, and for none where the reader picks the default', () => {
    const wear = vi.fn();
    const on1 = { ...asks(), wear } as Asks;

    picked(faces(on(), on1), 'Meiryo');
    expect(wear).toHaveBeenCalledWith({ 'font.name': 'Meiryo' }, ONE);

    picked(faces(on({ 'font.name': 'Meiryo' }), on1), '');
    expect(wear).toHaveBeenLastCalledWith({ 'font.name': null }, ONE);
  });

  it('is disabled until a cell is selected, since a look needs somewhere to land', () => {
    expect(box(faces(showingOf(), asks())).disabled).toBe(true);
  });
});

describe('the size the cells are set in', () => {
  it('asks for it as a number, which is what the schema says (`docs/spec.md` §6)', () => {
    const wear = vi.fn();

    picked(sizes(on(), { ...asks(), wear } as Asks), '14');
    expect(wear).toHaveBeenCalledWith({ 'font.size': 14 }, ONE);
  });

  it('keeps a size it does not offer, and shows what the cells wear', () => {
    const drawn = sizes(on({ 'font.size': 13 }), asks());

    expect(box(drawn).value).toBe('13');
    expect([...box(drawn).options].map((one) => one.value).at(-1)).toBe('13');
  });

  it('asks for none where the reader picks the empty one', () => {
    const wear = vi.fn();

    picked(sizes(on({ 'font.size': 14 }), { ...asks(), wear } as Asks), '');
    expect(wear).toHaveBeenCalledWith({ 'font.size': null }, ONE);
  });
});
