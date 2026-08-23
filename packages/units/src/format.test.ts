import { describe, expect, it } from 'vitest';
import { decimalsIn, MOST_DECIMALS, withDecimals } from './format';

describe('the decimals a number format shows', () => {
  it('is none where there is no format, and none where the code has no point', () => {
    expect(decimalsIn(null)).toBe(0);
    expect(decimalsIn('#,##0')).toBe(0);
  });

  it('is what stands after the point, whichever glyph says a digit', () => {
    expect(decimalsIn('#,##0.00')).toBe(2);
    expect(decimalsIn('0.0#')).toBe(2);
    expect(decimalsIn('0.000%')).toBe(3);
  });

  it('is read from the first section, which is what a positive number takes', () => {
    expect(decimalsIn('#,##0.0;[Red]-#,##0.000')).toBe(1);
  });

  it('does not read a point that is text', () => {
    expect(decimalsIn('0" ."')).toBe(0);
    expect(decimalsIn('0\\.0')).toBe(0);
  });
});

describe('a number format given so many decimals', () => {
  it('starts from a plain number where the cell has no format', () => {
    expect(withDecimals(null, 2)).toBe('0.00');
    expect(withDecimals(null, 0)).toBe('0');
  });

  it('adds a point where there is none, and takes it away with the last place', () => {
    expect(withDecimals('#,##0', 1)).toBe('#,##0.0');
    expect(withDecimals('#,##0.00', 0)).toBe('#,##0');
  });

  it('keeps what comes after the decimals, which is the format speaking', () => {
    expect(withDecimals('0.00%', 1)).toBe('0.0%');
    expect(withDecimals('¥#,##0', 2)).toBe('¥#,##0.00');
    expect(withDecimals('0" kg"', 1)).toBe('0.0" kg"');
  });

  it('says it in every section, as Excel does', () => {
    expect(withDecimals('#,##0.00;[Red]-#,##0.00', 1)).toBe('#,##0.0;[Red]-#,##0.0');
  });

  it('holds to the range a format can say', () => {
    expect(withDecimals('0.0', -1)).toBe('0');
    expect(decimalsIn(withDecimals('0.0', 99))).toBe(MOST_DECIMALS);
  });
});
