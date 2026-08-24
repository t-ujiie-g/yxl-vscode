import { describe, expect, it } from 'vitest';
import { parseQualifiedAddr, parseQualifiedRange } from './qualified';

describe('parseQualifiedAddr', () => {
  it('reads a bare sheet name', () => {
    expect(parseQualifiedAddr('Sales!E37')).toEqual({ sheet: 'Sales', at: 'E37' });
  });

  it('reads a quoted one, and unquotes it', () => {
    expect(parseQualifiedAddr("'Q3 data'!A1")).toEqual({ sheet: 'Q3 data', at: 'A1' });
  });

  it('reads an apostrophe inside a quoted name, written twice', () => {
    expect(parseQualifiedAddr("'Sam''s sheet'!B2")).toEqual({ sheet: "Sam's sheet", at: 'B2' });
  });

  it('divides a bare name at the first `!`', () => {
    expect(parseQualifiedAddr('a!b!A1')).toBeNull();
  });

  it('needs a sheet', () => {
    expect(parseQualifiedAddr('E37')).toBeNull();
    expect(parseQualifiedAddr('!E37')).toBeNull();
  });

  it('needs one cell, not a range', () => {
    expect(parseQualifiedAddr('Sales!E37:E40')).toBeNull();
  });

  it('refuses a quoted name that never closes', () => {
    expect(parseQualifiedAddr("'Q3 data!A1")).toBeNull();
    expect(parseQualifiedAddr("'Q3 data'A1")).toBeNull();
  });

  it('refuses a reference that is not one', () => {
    expect(parseQualifiedAddr('Sales!')).toBeNull();
    expect(parseQualifiedAddr('Sales!E0')).toBeNull();
  });
});

describe('parseQualifiedRange', () => {
  it('reads a range on a sheet, quoted or not', () => {
    expect(parseQualifiedRange('Statuses!A1:A3')).toEqual({ sheet: 'Statuses', at: 'A1:A3' });
    expect(parseQualifiedRange("'Q3 data'!B2:C4")).toEqual({ sheet: 'Q3 data', at: 'B2:C4' });
  });

  it('reads one that names no sheet as this sheet, and refuses a lone cell', () => {
    expect(parseQualifiedRange('A1:A3')).toEqual({ sheet: null, at: 'A1:A3' });
    expect(parseQualifiedRange('Statuses!A1')).toBeNull();
  });
});
