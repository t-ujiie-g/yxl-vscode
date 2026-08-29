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
