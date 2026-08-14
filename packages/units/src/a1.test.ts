import { describe, expect, it } from 'vitest';
import { parseA1Addr, parseA1Range } from './a1';

describe('parseA1Addr', () => {
  it('reads a reference and keeps it as written', () => {
    expect(parseA1Addr('A1')).toBe('A1');
    expect(parseA1Addr('AA10')).toBe('AA10');
    expect(parseA1Addr('XFD1048576')).toBe('XFD1048576');
  });

  it('accepts a padded row, as yxl does', () => {
    expect(parseA1Addr('A01')).toBe('A01');
  });

  it('refuses a row of zero', () => {
    expect(parseA1Addr('A0')).toBeNull();
    expect(parseA1Addr('A00')).toBeNull();
  });

  it('refuses anything that is not letters then digits', () => {
    for (const text of ['', 'A', '1', '1A', 'A1B', 'a1', '$A$1', 'A 1', 'Sheet1!A1']) {
      expect(parseA1Addr(text)).toBeNull();
    }
  });
});

describe('parseA1Range', () => {
  it('reads both corners', () => {
    expect(parseA1Range('A1:B9')).toBe('A1:B9');
  });

  it('keeps corners in the order written', () => {
    expect(parseA1Range('B9:A1')).toBe('B9:A1');
  });

  it('refuses a single cell, which is not a range', () => {
    expect(parseA1Range('A1')).toBeNull();
  });

  it('refuses a bad corner, an empty corner, or a second colon', () => {
    for (const text of ['A1:', ':B9', 'A0:B9', 'A1:B0', 'A1:B9:C1']) {
      expect(parseA1Range(text)).toBeNull();
    }
  });
});
