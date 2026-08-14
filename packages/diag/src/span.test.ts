import { describe, expect, it } from 'vitest';
import { span, union } from './span';

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
