import { describe, expect, it } from 'vitest';
import { meaning } from './typed';

describe('what a reader typed', () => {
  it('reads a leading `=` as a formula, and hands back the body without it', () => {
    expect(meaning('=SUM(A1:A2)')).toEqual({ is: 'formula', body: 'SUM(A1:A2)' });
  });

  it('reads an empty box as the cell emptied, which is not a value', () => {
    expect(meaning('')).toEqual({ is: 'empty' });
  });

  it('reads a bare scalar the way the spec would read it', () => {
    expect([meaning('42'), meaning('4.5'), meaning('true'), meaning('APAC')]).toEqual([
      { is: 'value', value: 42 },
      { is: 'value', value: 4.5 },
      { is: 'value', value: true },
      { is: 'value', value: 'APAC' },
    ]);
  });

  it('keeps text that only looks like a number, where YAML would too', () => {
    // A quoted `"007"` in the file is text; typing `007` is a number, which is
    // the same reading the spec gives an unquoted scalar (`docs/spec.md` §3).
    expect([meaning('007'), meaning('1e3'), meaning(' '), meaning('12a')]).toEqual([
      { is: 'value', value: 7 },
      { is: 'value', value: 1000 },
      { is: 'value', value: ' ' },
      { is: 'value', value: '12a' },
    ]);
  });

  it('reads only decimal notation as a number, as Excel does (#205)', () => {
    expect(
      ['0x1F', '0o17', '0b101', 'Infinity', '1e999', '-1.5e2', '.5', '+3'].map(meaning),
    ).toEqual([
      { is: 'value', value: '0x1F' },
      { is: 'value', value: '0o17' },
      { is: 'value', value: '0b101' },
      { is: 'value', value: 'Infinity' },
      { is: 'value', value: '1e999' },
      { is: 'value', value: -150 },
      { is: 'value', value: 0.5 },
      { is: 'value', value: 3 },
    ]);
  });

  it('reads TRUE and FALSE in any case as a truth value, as Excel does (#205)', () => {
    expect(['TRUE', 'False', 'true', 'FALSE'].map(meaning)).toEqual([
      { is: 'value', value: true },
      { is: 'value', value: false },
      { is: 'value', value: true },
      { is: 'value', value: false },
    ]);
  });

  it('is a formula even where nothing follows the `=`', () => {
    expect(meaning('=')).toEqual({ is: 'formula', body: '' });
  });
});
