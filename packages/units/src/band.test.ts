import { describe, expect, it } from 'vitest';
import { parseColumnSpan, parseRowSpan } from './band';

describe('parseColumnSpan', () => {
  it('reads one column and a range of columns', () => {
    expect(parseColumnSpan('B')).toBe('B');
    expect(parseColumnSpan('D-F')).toBe('D-F');
    expect(parseColumnSpan('Z-AA')).toBe('Z-AA');
  });

  it('accepts a range of one column', () => {
    expect(parseColumnSpan('D-D')).toBe('D-D');
  });

  it('refuses a reversed range', () => {
    expect(parseColumnSpan('F-D')).toBeNull();
    expect(parseColumnSpan('AA-Z')).toBeNull();
  });

  it('refuses a row number, lower case, and a half-written range', () => {
    for (const text of ['', '1', 'b', 'B1', 'B-', '-F', 'B-D-F']) {
      expect(parseColumnSpan(text)).toBeNull();
    }
  });
});

describe('parseRowSpan', () => {
  it('reads one row and a range of rows', () => {
    expect(parseRowSpan('1')).toBe('1');
    expect(parseRowSpan('2-4')).toBe('2-4');
  });

  it('accepts a padded row, as yxl does', () => {
    expect(parseRowSpan('01')).toBe('01');
  });

  it('refuses a reversed range', () => {
    expect(parseRowSpan('4-2')).toBeNull();
  });

  it('refuses row zero, a column label, and a half-written range', () => {
    for (const text of ['', '0', '0-4', 'B', '1-', '-4', '1-2-3']) {
      expect(parseRowSpan(text)).toBeNull();
    }
  });
});
