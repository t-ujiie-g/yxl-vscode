// @vitest-environment jsdom

import type { Color } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { flavours, onto } from './clipboard';
import type { DrawnCell, DrawnSheet } from './protocol';

function cell(of: Partial<DrawnCell> = {}): DrawnCell {
  return {
    row: 1,
    col: 1,
    value: null,
    formula: null,
    filledFrom: null,
    format: null,
    rich: null,
    computed: null,
    overridden: false,
    editable: 'direct',
    style: {},
    ...of,
  };
}

function sheet(cells: readonly DrawnCell[], of: Partial<DrawnSheet> = {}): DrawnSheet {
  return {
    name: 'Sales',
    rows: 4,
    columns: 4,
    at: { row: 1, col: 1 },
    of: { rows: 4, columns: 4 },
    widths: [],
    heights: [],
    cells,
    merges: [],
    problems: [],
    freeze: null,
    visibility: 'visible',
    tabColor: null,
    ...of,
  };
}

const whole = { top: 1, left: 1, bottom: 2, right: 2 };

describe('what a copied rectangle puts on the clipboard', () => {
  const GRID = sheet([
    cell({ row: 1, col: 1, value: 'APAC' }),
    cell({ row: 1, col: 2, value: 2400000 }),
    cell({ row: 2, col: 1, value: 'EMEA' }),
    cell({ row: 2, col: 2, value: 1750000 }),
  ]);

  it('writes the rows as tabs and lines, which is what every spreadsheet reads', () => {
    expect(flavours(GRID, whole)?.text).toBe('APAC\t2400000\nEMEA\t1750000');
  });

  it('writes the same rectangle as a table', () => {
    expect(flavours(GRID, whole)?.html).toBe(
      '<table>' +
        '<tr><td>APAC</td><td>2400000</td></tr>' +
        '<tr><td>EMEA</td><td>1750000</td></tr>' +
        '</table>',
    );
  });

  it('leaves a cell nothing writes empty on both sides', () => {
    const sparse = sheet([cell({ row: 1, col: 1, value: 'APAC' })]);

    expect(flavours(sparse, whole)?.text).toBe('APAC\t\n\t');
    expect(flavours(sparse, whole)?.html).toContain('<td>APAC</td><td></td>');
  });

  it('carries the value in the text and the format in the table (ADR-028)', () => {
    const shown = sheet([cell({ row: 1, col: 1, value: 1234.5, format: '#,##0.00' })]);
    const one = { top: 1, left: 1, bottom: 1, right: 1 };

    expect(flavours(shown, one)?.text).toBe('1234.5');
    expect(flavours(shown, one)?.html).toContain('>1,234.50<');
  });

  it('carries the look a cell was drawn wearing', () => {
    const styled = sheet([
      cell({
        row: 1,
        col: 1,
        value: 'Region',
        style: { 'font.bold': true, fill: 'FFFF00' as Color },
      }),
    ]);

    expect(flavours(styled, { top: 1, left: 1, bottom: 1, right: 1 })?.html).toBe(
      '<table><tr><td bgcolor="#FFFF00" style="font-weight: bold; background: #FFFF00">' +
        'Region</td></tr></table>',
    );
  });

  it('writes a colour as hex, which is the form the other spreadsheets read', () => {
    // The CSSOM turns `#FFFF00` into `rgb(255, 255, 0)`, which Excel passes
    // over — so the declarations are built rather than read back off an element.
    const styled = sheet([cell({ row: 1, col: 1, style: { fill: '80FF0000' as Color } })]);

    expect(flavours(styled, { top: 1, left: 1, bottom: 1, right: 1 })?.html).toContain(
      'bgcolor="#FF0000" style="background: #FF0000"',
    );
  });

  it('carries a computed result rather than the formula it came from', () => {
    const computed = sheet([
      cell({ row: 1, col: 1, formula: 'SUM(B1:B2)', computed: { kind: 'value', value: 4150000 } }),
    ]);

    expect(flavours(computed, { top: 1, left: 1, bottom: 1, right: 1 })?.text).toBe('4150000');
  });

  it('carries an uncomputed formula as the formula, which is all there is of it', () => {
    const uncomputed = sheet([cell({ row: 1, col: 1, formula: 'TODAY()' })]);
    expect(flavours(uncomputed, { top: 1, left: 1, bottom: 1, right: 1 })?.text).toBe('=TODAY()');
  });

  it('carries a filled cell its own formula, which is what the workbook holds there', () => {
    const filled = sheet([cell({ row: 1, col: 1, formula: 'A1*2', filledFrom: 'C2' })]);
    expect(flavours(filled, { top: 1, left: 1, bottom: 1, right: 1 })?.text).toBe('=A1*2');
  });

  it('quotes a field holding what a row or a field ends on', () => {
    const awkward = sheet([
      cell({ row: 1, col: 1, value: 'a\tb' }),
      cell({ row: 1, col: 2, value: 'say "hi"' }),
    ]);

    expect(flavours(awkward, { top: 1, left: 1, bottom: 1, right: 2 })?.text).toBe(
      '"a\tb"\t"say ""hi"""',
    );
  });

  it('escapes what the table cannot hold as itself', () => {
    const marked = sheet([cell({ row: 1, col: 1, value: '<b> & "x"' })]);

    expect(flavours(marked, { top: 1, left: 1, bottom: 1, right: 1 })?.html).toContain(
      '<td>&lt;b&gt; &amp; &quot;x&quot;</td>',
    );
  });

  it('says nothing at all where the rectangle reaches past what was drawn', () => {
    const window = sheet([cell({ row: 1, col: 1, value: 'APAC' })], {
      rows: 2,
      columns: 2,
      of: { rows: 400, columns: 4 },
    });

    expect(flavours(window, { top: 1, left: 1, bottom: 300, right: 2 })).toBeNull();
  });
});

describe('the flavours going onto the clipboard', () => {
  it('sets both, and takes the event over', () => {
    const wrote: Record<string, string> = {};
    let taken = false;

    document.execCommand = () => {
      const event = new Event('copy');
      Object.defineProperties(event, {
        clipboardData: {
          value: {
            setData: (kind: string, text: string) => {
              wrote[kind] = text;
            },
          },
        },
        preventDefault: {
          value: () => {
            taken = true;
          },
        },
      });
      document.dispatchEvent(event);
      return true;
    };

    expect(onto({ text: 'APAC', html: '<table></table>' })).toBe(true);
    expect(wrote).toEqual({ 'text/plain': 'APAC', 'text/html': '<table></table>' });
    expect(taken).toBe(true);
  });

  it('says no rather than throwing where the page cannot reach the clipboard', () => {
    document.execCommand = () => {
      throw new Error('not implemented');
    };

    expect(onto({ text: 'APAC', html: '' })).toBe(false);
  });
});
