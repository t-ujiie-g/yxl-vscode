import { describe, expect, it } from 'vitest';
import { reader } from './words';

describe('what the host words', () => {
  it('reads a refusal the core made, in either language', () => {
    const why = { id: 'intent.is-the-anchor', args: { at: 'N3' } };

    expect(reader('en')(why)).toContain('this range');
    expect(reader('ja')(why)).toBe(
      '`N3` はこの範囲の唯一の数式が書かれている場所で、変更すると範囲が埋めるすべてのセルが変わります',
    );
  });

  it('reads a sentence of its own that quotes one of the core’s', () => {
    const what = { id: 'intent.change-the-range-formula', args: { anchor: 'N3', formula: '' } };
    const said = { id: 'host.cells-changed', args: { what, many: 400 } };

    expect(reader('en')(said)).toBe('change the formula of the range at `N3`: 400 cells changed.');
    expect(reader('ja')(said)).toBe('`N3` の範囲の数式を変更する: 400 セルを変更しました。');
  });

  it('reads a diagnostic the compiler raised, where the reader is Japanese', () => {
    const problem = { id: 'compile.no-such-value', args: { name: 'nosuch' } };

    expect(reader('en')(problem)).toBe('no value is declared as `nosuch`');
    expect(reader('ja')(problem)).toBe('`nosuch` という名前の値は宣言されていません');
  });

  it('reads a message the loader built out of the path it was reading', () => {
    const what = {
      id: 'loader.under',
      args: { what: { id: 'loader.an-entry', args: { key: 'charts' } }, key: 'at' },
    };
    const problem = { id: 'loader.must-be-text', args: { what } };

    expect(reader('en')(problem)).toBe('a `charts` entry `at` must be text');
    expect(reader('ja')(problem)).toBe('`charts` のエントリの `at`は文字列である必要があります');
  });

  it('says a run of rows in each language’s own way, rather than one inside the other', () => {
    const said = { id: 'host.cannot-hide', args: { axis: 'row', first: 3, last: 5 } };
    const one = { id: 'host.hidden-done', args: { axis: 'column', first: 2, last: 2 } };

    expect(reader('en')(said)).toBe('nothing here can hide rows 3-5');
    expect(reader('ja')(said)).toBe('ここでは3〜5 行を非表示にできません');
    expect(reader('en')(one)).toBe('column B hidden.');
    expect(reader('ja')(one)).toBe('B 列を非表示にしました。');
  });

  it('reads every book this editor holds, whichever package said it', () => {
    expect(reader('ja')({ id: 'cst.key-exists', args: { key: 'A1' } })).toBe(
      '`A1` はすでにあります',
    );
    expect(reader('ja')({ id: 'view.bold', args: {} })).toBe('太字');
    expect(reader('ja')({ id: 'host.answer-is-gone', args: {} })).toContain(
      '方法ではなくなりました',
    );
  });
});
