// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cell, drawing, sheet as drawnSheet, showingOf } from './harness';
import { refusal } from './panels';
import { toolbar } from './toolbar';
import { chrome, spanned } from './worded';

afterEach(() => {
  document.documentElement.lang = '';
});

/** The toolbar as it is drawn, which is the panel's own words rather than the core's. */
function bar(): HTMLElement {
  const sheet = drawnSheet({
    rows: 10,
    columns: 10,
    of: { rows: 10, columns: 10 },
    cells: [cell(1, 1, { value: 1 })],
  });

  return toolbar(
    showingOf({ drawing: drawing({ sheets: [sheet] }), selected: { row: 1, col: 1 } }),
    {} as never,
  );
}

describe('the panel in the reader’s own language', () => {
  it('draws its controls in Japanese where the page is Japanese', () => {
    document.documentElement.lang = 'ja';
    const said = [...bar().querySelectorAll('[data-says]')]
      .map((one) => one.getAttribute('data-says'))
      .join(' | ');

    expect(said).toContain('太字 (Ctrl+B)');
    expect(said).toContain('文字色');
    expect(said).toContain('左揃え');
  });

  it('draws them in English where it is anything else', () => {
    document.documentElement.lang = 'en-GB';
    const said = [...bar().querySelectorAll('[data-says]')]
      .map((one) => one.getAttribute('data-says'))
      .join(' | ');

    expect(said).toContain('Bold (Ctrl+B)');
    expect(said).toContain('Text colour');
  });

  it('counts a run of bands the way each language counts them', () => {
    document.documentElement.lang = 'en';
    expect(chrome('view.hide-bands', { many: 3, axis: 'column' })).toBe('Hide these 3 columns');
    expect(chrome('view.hide-bands', { many: 1, axis: 'row' })).toBe('Hide this row');
    expect(spanned('column', 2, 5)).toBe('columns B-E');

    document.documentElement.lang = 'ja';
    expect(chrome('view.hide-bands', { many: 3, axis: 'column' })).toBe('3 列を非表示');
    expect(chrome('view.hide-bands', { many: 1, axis: 'row' })).toBe('1 行を非表示');
    expect(spanned('column', 2, 5)).toBe('B〜E 列');
  });

  it('puts the insert side where each language puts it', () => {
    document.documentElement.lang = 'en';
    expect(chrome('view.insert-before', { many: 2, axis: 'column' })).toBe('Insert 2 columns left');
    expect(chrome('view.insert-after', { many: 1, axis: 'row' })).toBe('Insert row below');

    document.documentElement.lang = 'ja';
    expect(chrome('view.insert-before', { many: 2, axis: 'column' })).toBe('2 列を左に挿入');
    expect(chrome('view.insert-after', { many: 1, axis: 'row' })).toBe('1 行を下に挿入');
  });
});

describe('what the host said, worded in the panel', () => {
  it('reaches the panel already worded, since the host owns those books', () => {
    document.documentElement.lang = 'ja';
    const refused = {
      kind: 'refused' as const,
      why: 'N3 はこの範囲の唯一の数式が書かれている場所です',
      about: null,
      canOverride: false,
      choices: [],
    };

    expect(refusal(refused, {} as never).querySelector('.why')?.textContent).toBe(refused.why);
  });
});
