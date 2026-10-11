import { describe, expect, it } from 'vitest';
import { japanese } from './japanese';

describe('japanese', () => {
  it('writes the era and its year out as text, leaving the rest of the format alone', () => {
    expect(japanese('ggge"年"m"月"d"日"', 46302)).toBe('"令和""8""年"m"月"d"日"');
  });

  it('leaves an `e` alone where nothing says the calendar is Japan’s', () => {
    expect(japanese('yyyy e', 46302)).toBe('yyyy e');
    expect(japanese('[$-411]e', 46302)).toBe('[$-411]"8"');
  });

  it('leaves what is quoted, escaped or bracketed alone', () => {
    expect(japanese('"gate"\\g[Red]aaa', 46302)).toBe('"gate"\\g[Red]"水"');
  });

  it('leaves a format with none of the codes as it was', () => {
    expect(japanese('yyyy-mm-dd', 46302)).toBe('yyyy-mm-dd');
  });
});
