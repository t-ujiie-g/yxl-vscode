import { describe, expect, it } from 'vitest';
import { CELL_TYPES } from './cell';
import { MODELED_KEYS } from './keys';
import { BORDER_SIDES, BORDER_STYLES, H_ALIGNS, V_ALIGNS } from './style';

const vocabularies = { CELL_TYPES, BORDER_SIDES, BORDER_STYLES, H_ALIGNS, V_ALIGNS };

describe.each(Object.entries(vocabularies))('%s', (_name, spellings) => {
  it('names each spelling once', () => {
    expect(new Set(spellings).size).toBe(spellings.length);
  });
});

describe('MODELED_KEYS', () => {
  it('gives the two bands the same keys apart from their size', () => {
    // `docs/spec.md` §4 is one table for both axes, with `width` in character
    // units on one and `height` in points on the other. A key that reached one
    // list and not the other would be a band the editor half-reads.
    const columns = [...MODELED_KEYS.columnBand].filter((key) => key !== 'width');
    const rows = [...MODELED_KEYS.rowBand].filter((key) => key !== 'height');
    expect(columns).toEqual(rows);
    expect(MODELED_KEYS.columnBand.has('width')).toBe(true);
    expect(MODELED_KEYS.rowBand.has('height')).toBe(true);
  });

  it('reads a border by its sides', () => {
    expect([...MODELED_KEYS.border]).toEqual([...BORDER_SIDES]);
  });
});
