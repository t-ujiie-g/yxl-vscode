import { describe, expect, it } from 'vitest';
import { contains, span, union } from './span';

describe('union', () => {
  it('covers both spans', () => {
    expect(union(span(4, 9), span(12, 20))).toEqual({ start: 4, end: 20 });
  });

  it('does not care which argument comes first in the file', () => {
    expect(union(span(12, 20), span(4, 9))).toEqual({ start: 4, end: 20 });
  });

  it('keeps the outer bounds when one span nests inside the other', () => {
    expect(union(span(4, 20), span(8, 12))).toEqual({ start: 4, end: 20 });
  });
});

describe('contains', () => {
  it('includes the start offset', () => {
    expect(contains(span(4, 9), 4)).toBe(true);
  });

  it('excludes the end offset, so adjacent spans do not both claim it', () => {
    expect(contains(span(4, 9), 9)).toBe(false);
    expect(contains(span(9, 12), 9)).toBe(true);
  });

  it('rejects an offset outside', () => {
    expect(contains(span(4, 9), 3)).toBe(false);
    expect(contains(span(4, 9), 10)).toBe(false);
  });
});
