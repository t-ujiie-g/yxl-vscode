import { describe, expect, it } from 'vitest';
import {
  filePath,
  formulaName,
  nextSheetName,
  paramName,
  type SheetName,
  sheetName,
  styleName,
  valueName,
  whyNotASheetName,
} from './name';

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

describe('why a typed name is not one a sheet can have', () => {
  it('is nothing where it is one', () => {
    expect(whyNotASheetName('Sales')).toBeNull();
    expect(whyNotASheetName('Q3 data')).toBeNull();
    expect(whyNotASheetName('支店別売上')).toBeNull();
  });

  it("is Excel's own rule, named", () => {
    expect(whyNotASheetName('')).toBe('a sheet needs a name');
    expect(whyNotASheetName('a'.repeat(32))).toBe('a sheet name is at most 31 characters');
    expect(whyNotASheetName('支'.repeat(31))).toBeNull();
    expect(whyNotASheetName('Q3/Q4')).toBe('a sheet name cannot hold `/`');
    expect(whyNotASheetName("'quoted'")).toBe(
      'a sheet name cannot start or end with an apostrophe',
    );
    expect(whyNotASheetName('History')).toBe('`History` is a name Excel keeps for itself');
  });
});

describe('the name a new sheet is offered under', () => {
  it('counts past the sheets there are, and past one already called that', () => {
    expect(nextSheetName(['Sales' as SheetName])).toBe('Sheet2');
    expect(nextSheetName(['Sales' as SheetName, 'Sheet2' as SheetName])).toBe('Sheet3');
    expect(nextSheetName(['Sheet2' as SheetName])).toBe('Sheet3');
  });
});
