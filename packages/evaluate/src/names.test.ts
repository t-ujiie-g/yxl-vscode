import type { CompiledName } from '@yxl-vscode/compile';
import type { SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { refersTo, spelledOut } from './names';

const NAMES: CompiledName[] = [
  { name: 'stores', sheet: 'Masters' as SheetName, rect: { top: 1, bottom: 6, left: 1, right: 3 } },
  {
    name: 'stores.code',
    sheet: 'Masters' as SheetName,
    rect: { top: 2, bottom: 6, left: 1, right: 1 },
  },
  { name: '売上.cy', sheet: '実績' as SheetName, rect: { top: 4, bottom: 7, left: 2, right: 2 } },
];
const names = refersTo(NAMES);

describe('the range a defined name refers to', () => {
  it('is absolute, its sheet spelled as a formula spells it', () => {
    expect(names.get('stores')).toBe('Masters!$A$1:$C$6');
    expect(names.get('売上.cy')).toBe("'実績'!$B$4:$B$7");
  });
});

describe('a formula with its defined names spelled out', () => {
  it('replaces each name, ignoring case as Excel does', () => {
    expect(spelledOut('MATCH(A2, Stores.Code, 0)', names)).toBe('MATCH(A2, Masters!$A$2:$A$6, 0)');
    expect(spelledOut('SUM(売上.cy)*2', names)).toBe("SUM('実績'!$B$4:$B$7)*2");
  });

  it('leaves text, quoted sheets, functions, tables and cell references alone', () => {
    for (const formula of [
      '"stores.code"',
      "'stores'!A1",
      'stores(1)',
      'stores[code]',
      'A1+$B$2+Sheet1!C3',
      'stores.codes',
      '"say ""stores"" twice"',
      "'it''s stores'!A1",
    ]) {
      expect(spelledOut(formula, names)).toBe(formula);
    }
  });

  it('is the formula itself where there are no names', () => {
    expect(spelledOut('SUM(stores)', new Map())).toBe('SUM(stores)');
  });
});
