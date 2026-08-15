import { describe, expect, it } from 'vitest';
import { sheetAgain } from './again';

const SHEETS = [{ name: 'Sales' }, { name: 'Notes' }, { name: 'Rates' }];

describe('the sheet the reader was looking at, after another read', () => {
  it('is the one at the same place, when that is still the same sheet', () => {
    expect(sheetAgain(SHEETS, { name: 'Notes', index: 1 })).toBe(1);
  });

  it('follows its name when a sheet appears before it', () => {
    expect(sheetAgain([{ name: 'Summary' }, ...SHEETS], { name: 'Notes', index: 1 })).toBe(2);
  });

  it('follows its name when a sheet before it is deleted', () => {
    expect(sheetAgain([{ name: 'Notes' }, { name: 'Rates' }], { name: 'Notes', index: 1 })).toBe(0);
  });

  it('falls back to the first sheet when the one being read is gone', () => {
    expect(sheetAgain(SHEETS, { name: 'Draft', index: 1 })).toBe(0);
  });

  it('keeps two sheets sharing a name apart while a spec is half-written', () => {
    // The workbook forbids this (`docs/spec.md` §2), which is why position is
    // tried first: while it lasts, the second tab is still the second tab.
    const same = [{ name: 'Sales' }, { name: 'Sales' }];
    expect(sheetAgain(same, { name: 'Sales', index: 1 })).toBe(1);
  });

  it('starts at the first sheet when nothing was being looked at', () => {
    expect(sheetAgain(SHEETS, null)).toBe(0);
  });

  it('starts at the first sheet of a spec that has none, which draws nothing', () => {
    expect(sheetAgain([], { name: 'Sales', index: 0 })).toBe(0);
  });
});
