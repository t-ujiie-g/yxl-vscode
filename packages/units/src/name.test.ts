import { describe, expect, it } from 'vitest';
import { filePath, formulaName, paramName, sheetName, styleName, valueName } from './name';

const constructors = { sheetName, styleName, valueName, formulaName, paramName, filePath };

describe.each(Object.entries(constructors))('%s', (_name, read) => {
  it('keeps the text it was given', () => {
    expect(read('Sales')).toBe('Sales');
  });

  it('refuses the empty string, which names nothing', () => {
    expect(read('')).toBeNull();
  });
});

describe('sheetName', () => {
  it('accepts a name Excel would refuse, leaving that to the compiler', () => {
    // `docs/spec.md` §2 forbids both, and `yxl build --check` is where a spec
    // hears about it (ADR-011) — a spec that breaks a rule still has to open.
    expect(sheetName('History')).toBe('History');
    expect(sheetName('a/b')).toBe('a/b');
  });
});
