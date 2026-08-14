import { describe, expect, it } from 'vitest';
import { parseColor } from './color';

describe('parseColor', () => {
  it('reads six and eight hex digits', () => {
    expect(parseColor('1F3864')).toBe('1F3864');
    expect(parseColor('FF1F3864')).toBe('FF1F3864');
  });

  it('keeps the spelling the spec used', () => {
    expect(parseColor('1f3864')).toBe('1f3864');
    expect(parseColor('#1F3864')).toBe('#1F3864');
  });

  it('refuses any other width, a non-hex digit, and an empty string', () => {
    for (const text of ['', 'FFF', '1F386', '1F38644', 'GGGGGG', '#', 'red']) {
      expect(parseColor(text)).toBeNull();
    }
  });
});
