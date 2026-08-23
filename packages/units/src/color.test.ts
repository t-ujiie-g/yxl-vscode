import { describe, expect, it } from 'vitest';
import { painted, parseColor } from './color';

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

describe('a colour as a screen paints it', () => {
  it('drops the alpha byte of an `AARRGGBB` spelling, which Excel ignores', () => {
    expect(painted('00303AB2')).toBe('#303AB2');
    expect(painted('FF303AB2')).toBe('#303AB2');
  });

  it('leaves a six-digit colour alone, with or without its `#`', () => {
    expect(painted('303AB2')).toBe('#303AB2');
    expect(painted('#303AB2')).toBe('#303AB2');
  });
});
