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

  it('is a formula even where nothing follows the `=`', () => {
    expect(meaning('=')).toEqual({ is: 'formula', body: '' });
  });
});
