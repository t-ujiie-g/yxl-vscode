import { describe, expect, it } from 'vitest';
import { tabular } from './tabular';

describe('a rectangle read off the clipboard', () => {
  it('reads rows by line and fields by tab', () => {
    expect(tabular('APAC\t1\nEMEA\t2')).toEqual([
      ['APAC', '1'],
      ['EMEA', '2'],
    ]);
  });

  it('reads the trailing newline a spreadsheet writes as the end, not as a row', () => {
    expect(tabular('APAC\t1\n')).toEqual([['APAC', '1']]);
  });

  it('reads the line ending Windows writes', () => {
    expect(tabular('APAC\t1\r\nEMEA\t2\r\n')).toEqual([
      ['APAC', '1'],
      ['EMEA', '2'],
    ]);
  });

  it('takes a quoted field whole, tabs and lines and all', () => {
    expect(tabular('"a\tb"\t"one\ntwo"')).toEqual([['a\tb', 'one\ntwo']]);
  });

  it('reads a doubled quote inside a quoted field as the one it stands for', () => {
    expect(tabular('"say ""hi"""\tx')).toEqual([['say "hi"', 'x']]);
  });

  it('leaves a quote that starts nothing where it is', () => {
    expect(tabular('5" pipe\tx')).toEqual([['5" pipe', 'x']]);
  });

  it('keeps an empty field as an empty field', () => {
    expect(tabular('a\t\tb')).toEqual([['a', '', 'b']]);
  });

  it('makes a short row up to the widest, so what comes back is a rectangle', () => {
    expect(tabular('a\tb\tc\nd')).toEqual([
      ['a', 'b', 'c'],
      ['d', '', ''],
    ]);
  });

  it('reads one field as one cell', () => {
    expect(tabular('APAC')).toEqual([['APAC']]);
  });

  it('reads nothing as nothing', () => {
    expect(tabular('')).toEqual([]);
  });
});
