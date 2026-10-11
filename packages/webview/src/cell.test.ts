// @vitest-environment jsdom

import { type Color, parseColor } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { drawCell, gridline, typeInto, underFormat } from './cell';
import { cell } from './harness';
import type { DrawnCell } from './protocol';

/** A colour, branded the way the projection would have branded it. */
function colour(hex: string): Color {
  const read = parseColor(hex);
  if (read === null) throw new Error(`not a colour: ${hex}`);
  return read;
}

describe('what a cell says', () => {
  it('shows the value the spec put there', () => {
    expect(drawCell(cell(1, 1, { value: 'APAC' }), undefined).textContent).toBe('APAC');
  });

  it('shows a number under its format', () => {
    expect(drawCell(cell(1, 1, { value: 0.085, format: '0.0%' }), undefined).textContent).toBe(
      '8.5%',
    );
  });

  it('shows a formula as its own text, having computed nothing', () => {
    expect(drawCell(cell(1, 1, { formula: 'SUM(A1:A2)' }), undefined).textContent).toBe(
      '=SUM(A1:A2)',
    );
  });

  it('shows the cached result Excel would show, over the formula that produced it', () => {
    const drawn = drawCell(cell(1, 1, { value: 12, formula: 'SUM(A1:A2)' }), undefined);
    expect([drawn.textContent, drawn.title]).toEqual(['12', '=SUM(A1:A2)']);
  });

  it('shows a filled cell its own formula, and says on hover where it is filled from', () => {
    const drawn = drawCell(cell(1, 1, { formula: 'B3*0.05', filledFrom: 'C2' }), undefined);

    expect(drawn.textContent).toBe('=B3*0.05');
    expect(drawn.classList.contains('filled')).toBe(true);
    expect(drawn.title).toBe('=B3*0.05 — filled from C2');
  });

  it('shows what a formula came to, with the formula a hover away', () => {
    const drawn = drawCell(
      cell(1, 1, { formula: 'SUM(B2:B3)', computed: { kind: 'value', value: 4150000 } }),
      undefined,
    );

    expect(drawn.textContent).toBe('4150000');
    expect(drawn.title).toBe('=SUM(B2:B3)');
  });

  it('shows a computed number under the format the cell wears', () => {
    const computed = { kind: 'value', value: 0.085 } as const;
    expect(
      drawCell(cell(1, 1, { formula: 'x', computed, format: '0.0%' }), undefined).textContent,
    ).toBe('8.5%');
  });

  it("shows Excel's own error text, marked as a problem", () => {
    const drawn = drawCell(
      cell(1, 1, { formula: '1/0', computed: { kind: 'error', error: '#DIV/0!' } }),
      undefined,
    );

    expect(drawn.textContent).toBe('#DIV/0!');
    expect(drawn.classList.contains('problem')).toBe(true);
  });

  it('falls back to the formula when nothing could be computed, never to a number', () => {
    const computed = { kind: 'unsupported', why: 'this function answers asynchronously' } as const;
    const drawn = drawCell(cell(1, 1, { formula: 'WEBSERVICE(A1)', computed }), undefined);

    expect(drawn.textContent).toBe('=WEBSERVICE(A1)');
    expect(drawn.title).toContain('not computed');
  });

  it('shows a filled cell its own result rather than where it reads from', () => {
    // The marker is what a cell of a range says when nothing computed it; with
    // a value there is a value to show, and the story stays on the hover.
    const computed = { kind: 'value', value: 10 } as const;
    const drawn = drawCell(
      cell(1, 1, { formula: 'B2*0.05', filledFrom: 'C2', computed }),
      undefined,
    );

    expect(drawn.textContent).toBe('10');
    expect(drawn.title).toContain('filled from C2');
  });

  it('shows a cell written in runs as its runs, each wearing its own font', () => {
    const drawn = drawCell(
      cell(1, 1, {
        rich: [
          { text: 'Figures are ', style: {} },
          { text: 'unaudited', style: { 'font.italic': true, 'font.color': colour('C00000') } },
          { text: ' as of Q3.', style: {} },
        ],
      }),
      undefined,
    );
    const runs = [...drawn.querySelectorAll('span')];

    expect(drawn.textContent).toBe('Figures are unaudited as of Q3.');
    expect(runs.map((one) => one.style.fontStyle)).toEqual(['', 'italic', '']);
    expect(runs[1]?.style.color).toBe('rgb(192, 0, 0)');
  });

  it('shows nothing for an address only a band reaches', () => {
    expect(drawCell(cell(1, 1, { style: { 'font.bold': true } }), undefined).textContent).toBe('');
  });

  it('shows a pattern the formatter cannot read as its own error, keeping the view', () => {
    expect(drawCell(cell(1, 1, { value: 1, format: 'nonsense' }), undefined).textContent).toContain(
      '#',
    );
  });
});

describe('what a cell shows, as Excel shows it', () => {
  const says = (of: Partial<DrawnCell>) => drawCell(cell(1, 1, of), undefined).textContent;

  it.each([
    [1 / 3, '0.333333333'],
    [(2 / 3) * 100, '66.66666667'],
    [1234567890123, '1.23457E+12'],
  ])('shows %s in General where nothing sets a format (#209)', (value, shows) => {
    expect(says({ value })).toBe(shows);
  });

  it('shows a date of a 1904 workbook as the day it is, not four years and a day before (#210)', () => {
    expect(says({ value: 44840, format: 'yyyy-mm-dd', date1904: true })).toBe('2026-10-07');
    expect(says({ value: 44840, format: '0', date1904: true })).toBe('44840');
  });

  it.each([
    ['ggge"年"m"月"d"日"', '令和8年10月7日'],
    ['[$-411]ggge"年"m"月"d"日"', '令和8年10月7日'],
    ['gge"年"', '令8年'],
    ['g ee', 'R 08'],
    ['m/d(aaa)', '10/7(水)'],
    ['aaaa', '水曜日'],
  ])('writes the Japanese codes in %s as Excel in Japanese does (#211)', (format, shows) => {
    expect(says({ value: 46302, format })).toBe(shows);
  });

  it('names each era from its first day (#211)', () => {
    expect(says({ value: 43586, format: 'ggge"年"m"月"d"日"' })).toBe('令和1年5月1日');
    expect(says({ value: 43585, format: 'ggge"年"m"月"d"日"' })).toBe('平成31年4月30日');
  });

  it('shows a truth value in capitals (#213)', () => {
    expect([says({ value: true }), says({ value: false })]).toEqual(['TRUE', 'FALSE']);
  });

  it("puts text through its own format's text section (#213)", () => {
    expect(says({ value: '田中', format: '@"様"' })).toBe('田中様');
    expect(says({ value: '田中', format: '#,##0' })).toBe('田中');
  });
});

describe('what a cell looks like', () => {
  it('wears the weight, the fill, and the alignment it was given', () => {
    const style = {
      'font.bold': true,
      fill: colour('FFFF00'),
      'align.horizontal': 'center',
    } as const;
    const drawn = drawCell(cell(1, 1, { value: 'x', style }), undefined);

    expect(drawn.style.fontWeight).toBe('bold');
    expect(drawn.style.backgroundColor).toBe('rgb(255, 255, 0)');
    expect(drawn.style.textAlign).toBe('center');
  });

  it('drops the alpha byte of a colour, whichever byte it is', () => {
    // Excel ignores it: `0000FF00` is the same opaque green as `FF00FF00`, and
    // a `00` handed to CSS would be an invisible cell.
    const opaque = drawCell(
      cell(1, 1, { value: 'x', style: { fill: colour('FF00FF00') } }),
      undefined,
    );
    expect(opaque.style.backgroundColor).toBe('rgb(0, 255, 0)');

    const clear = drawCell(
      cell(1, 1, { value: 'x', style: { fill: colour('0000FF00') } }),
      undefined,
    );
    expect(clear.style.backgroundColor).toBe('rgb(0, 255, 0)');
  });

  it('draws each border edge it was given', () => {
    const style = {
      'border.top.style': 'thick',
      'border.top.color': colour('FF0000'),
    } as const;
    const over = drawCell(cell(1, 1, { value: 'x', style }), undefined).querySelector<HTMLElement>(
      '.edges',
    );

    expect(over?.style.borderTop).toBe('3px solid rgb(255, 0, 0)');
  });

  it('draws an edge with no colour of its own in the text colour', () => {
    const drawn = drawCell(
      cell(1, 1, { value: 'x', style: { 'border.left.style': 'hair' } }),
      undefined,
    );
    // jsdom's CSSOM drops the `currentColor` keyword when it serializes the
    // shorthand back; a browser keeps it, and either way no colour was chosen.
    expect(drawn.querySelector<HTMLElement>('.edges')?.style.borderLeft).toBe('0.5px solid');
  });
});

describe('where a cell with no alignment of its own puts what it shows', () => {
  const aligned = (of: Partial<DrawnCell>) => drawCell(cell(1, 1, of), undefined).style.textAlign;

  it('puts a number right, as Excel does (#201)', () => {
    expect(aligned({ value: 123.4 })).toBe('right');
  });

  it('centres a value written as an error, as it centres a computed one (#213)', () => {
    expect(aligned({ value: '#N/A', error: true })).toBe('center');
  });

  it('puts a date right, since a date is the number Excel keeps', () => {
    expect(aligned({ value: 46302, format: 'yyyy-mm-dd' })).toBe('right');
  });

  it('puts a truth value in the middle', () => {
    expect(aligned({ value: true })).toBe('center');
  });

  it('puts an error in the middle', () => {
    expect(aligned({ formula: '1/0', computed: { kind: 'error', error: '#DIV/0!' } })).toBe(
      'center',
    );
  });

  it('goes by what a formula came to, not by the formula', () => {
    expect(aligned({ formula: 'A1*2', computed: { kind: 'value', value: 8 } })).toBe('right');
  });

  it('leaves text where the stylesheet puts it', () => {
    expect(aligned({ value: '文字' })).toBe('');
  });

  it('gives way to the alignment the cell was given', () => {
    expect(aligned({ value: 123.4, style: { 'align.horizontal': 'left' } })).toBe('left');
  });
});

describe('the colour a number format gives the number', () => {
  const coloured = (value: number, format: string, of: Partial<DrawnCell> = {}) =>
    drawCell(cell(1, 1, { value, format, ...of }), undefined).style.color;

  it("draws text in its own format's text section colour (#213)", () => {
    const drawn = drawCell(cell(1, 1, { value: 'x', format: '0;-0;0;[Blue]@' }), undefined);
    expect(drawn.style.color).toBe('rgb(0, 0, 255)');
  });

  it("draws a negative number in its section's colour (#200)", () => {
    expect(coloured(-12.3, '0.0_ ;[Red]\\-0.0\\ ')).toBe('rgb(255, 0, 0)');
  });

  it('draws each section in its own colour', () => {
    expect([coloured(5, '[Blue]0.0;[Red]0.0'), coloured(-5, '[Blue]0.0;[Red]0.0')]).toEqual([
      'rgb(0, 0, 255)',
      'rgb(255, 0, 0)',
    ]);
  });

  it("draws Excel's green, which is not CSS's", () => {
    expect(coloured(1, '[Green]0')).toBe('rgb(0, 255, 0)');
  });

  it('draws a colour given by its index in the palette', () => {
    expect(coloured(1, '[Color10]0')).toBe('rgb(0, 128, 0)');
  });

  it('wins over the font colour, as in Excel', () => {
    expect(coloured(-1, '0;[Red]-0', { style: { 'font.color': colour('0000FF') } })).toBe(
      'rgb(255, 0, 0)',
    );
  });

  it('leaves the font colour alone in a section that names none', () => {
    expect(coloured(1, '0;[Red]-0', { style: { 'font.color': colour('0000FF') } })).toBe(
      'rgb(0, 0, 255)',
    );
  });
});

describe('a cell the reader cannot type into', () => {
  it('is marked, so the reader knows before they try rather than after', () => {
    const drawn = drawCell(cell(1, 1, { value: 1, editable: 'external' }), undefined);

    expect(drawn.classList.contains('locked')).toBe(true);
    expect(drawn.title).toContain('a file beside the spec');
  });

  it('says which of the two things stands in the way', () => {
    const drawn = drawCell(cell(1, 1, { value: 1, editable: 'mediated' }), undefined);
    expect(drawn.title).toContain('more than one thing could change');
  });

  it('is not marked when one node of the spec says it', () => {
    expect(drawCell(cell(1, 1, { value: 1 }), undefined).classList.contains('locked')).toBe(false);
  });

  it('keeps the two marks apart: an exception made, and one the spec makes', () => {
    const drawn = drawCell(cell(1, 1, { value: 1, overridden: true }), undefined);

    expect(drawn.classList.contains('overridden')).toBe(true);
    expect(drawn.classList.contains('locked')).toBe(false);
    expect(drawn.title).toContain('written as an override');
  });
});

describe('a cell that anchors a merge', () => {
  it('spans the rows and columns of it that are drawn', () => {
    const merge = { top: 1, left: 1, bottom: 2, right: 4, rows: 2, cols: 3, height: 40, cut: null };
    const drawn = drawCell(cell(1, 1, { value: 'wide' }), merge);
    expect([drawn.colSpan, drawn.rowSpan]).toEqual([3, 2]);
  });

  it('holds its value in a box cut at the height of its rows', () => {
    const merge = { top: 1, left: 1, bottom: 1, right: 2, rows: 1, cols: 2, height: 20, cut: null };
    const drawn = drawCell(cell(1, 1, { value: 'wide' }), merge);
    const within = drawn.querySelector<HTMLElement>(':scope > .within');

    expect([within?.textContent, within?.style.getPropertyValue('--spans')]).toEqual([
      'wide',
      '20px',
    ]);
  });

  it('leaves its data bar outside that box, as wide as the whole merge', () => {
    const merge = { top: 1, left: 1, bottom: 1, right: 2, rows: 1, cols: 2, height: 20, cut: null };
    const bar = { color: '638EC6', fraction: 0.5, barOnly: false };
    const drawn = drawCell(cell(1, 1, { value: 5, bar }), merge);

    expect([...drawn.children].map((one) => one.className)).toEqual(['bar', 'within']);
  });

  it('spans nothing when nothing is merged there', () => {
    const drawn = drawCell(cell(1, 1, { value: 'x' }), undefined);
    expect([drawn.colSpan, drawn.rowSpan]).toEqual([1, 1]);
  });
});

describe('the box a reader types in', () => {
  function box(of: Partial<DrawnCell>): string {
    const at = document.createElement('td');
    typeInto(at, cell(1, 1, of), undefined, () => {});
    return at.querySelector<HTMLTextAreaElement>('.typing')?.value ?? '';
  }

  it('holds what the spec holds, formula and value alike', () => {
    expect([box({ formula: 'SUM(A1:A2)' }), box({ value: 12 })]).toEqual(['=SUM(A1:A2)', '12']);
  });

  it('holds a filled cell its own formula, not the one the range stores', () => {
    // Typing `*1.1` onto the end of the anchor's formula would write a formula
    // for a row this cell is not on.
    expect(box({ formula: 'C5*D5', filledFrom: 'E2' })).toBe('=C5*D5');
  });
});

describe('a cell underlined and struck through', () => {
  it('draws both lines, not the last one set (#213)', () => {
    const drawn = drawCell(
      cell(1, 1, { value: 'x', style: { 'font.underline': true, 'font.strike': true } }),
      undefined,
    );
    expect(drawn.style.textDecoration).toBe('underline line-through');
  });
});

describe('the borders a cell wears', () => {
  const edges = (of: Partial<DrawnCell>) =>
    drawCell(cell(1, 1, of), undefined).querySelector('.edges');

  it('are drawn over the grid own lines rather than on the cell itself', () => {
    const drawn = drawCell(cell(1, 1, { style: { 'border.left.style': 'thin' } }), undefined);

    expect(drawn.style.borderLeft).toBe('');
    expect(drawn.querySelector<HTMLElement>('.edges')?.style.borderLeft).toBe('1px solid');
  });

  it("are drawn in the cell only on the sheet's first row and column, where no neighbour has a gridline for them (#212)", () => {
    const style = {
      'border.top.style': 'thin',
      'border.left.style': 'thin',
      'border.bottom.style': 'double',
    } as const;

    expect(edges({ style })?.getAttribute('style')).toBe(
      'border-left: 1px solid; border-top: 1px solid;',
    );
    expect(drawCell(cell(2, 2, { style }), undefined).querySelector('.edges')).toBeNull();
  });

  it('are not there at all where the cell has none', () => {
    expect(edges({ style: { 'font.bold': true } })).toBeNull();
  });

  it('keep the colour the spec drew them in', () => {
    const over = edges({
      style: { 'border.top.style': 'thin', 'border.top.color': 'CCCCCC' as never },
    });

    expect(over?.getAttribute('style')).toBe('border-top: 1px solid rgb(204, 204, 204);');
  });
});

describe('the line on a gridline two cells share (#212)', () => {
  it("is the one cell's edge, or the other's facing it, not both", () => {
    expect(gridline({ 'border.right.style': 'thin' }, undefined, 'right')).toBe(
      '1px solid currentColor',
    );
    expect(gridline(undefined, { 'border.left.style': 'thin' }, 'right')).toBe(
      '1px solid currentColor',
    );
    expect(
      gridline({ 'border.bottom.style': 'thin' }, { 'border.top.style': 'thin' }, 'bottom'),
    ).toBe('1px solid currentColor');
  });

  it('is the heavier of the two where both draw one, as Excel draws it', () => {
    expect(
      gridline({ 'border.right.style': 'thin' }, { 'border.left.style': 'thick' }, 'right'),
    ).toBe('3px solid currentColor');
  });

  it('is nothing where neither cell draws one, which leaves the gridline', () => {
    expect(gridline({ 'font.bold': true }, undefined, 'bottom')).toBeNull();
  });
});

describe('what a format would make of the number a cell shows', () => {
  it('is the number the spec holds, under the code asked about', () => {
    expect(underFormat(cell(1, 1, { value: 1234.5678 }), '#,##0.00')).toBe('1,234.57');
  });

  it('is what a formula was computed to, since that is the number on screen (ADR-014)', () => {
    const of = cell(1, 1, { value: null, computed: { kind: 'value', value: 0.085 } });

    expect(underFormat(of, '0.0%')).toBe('8.5%');
  });

  it('is nothing where the cell holds no number to make anything of', () => {
    expect(underFormat(cell(1, 1, { value: 'APAC' }), '#,##0')).toBeNull();
    expect(underFormat(cell(1, 1, { value: null }), '#,##0')).toBeNull();
  });
});

describe('a cell a data bar reaches', () => {
  it('draws the bar behind the value, as wide as the fraction says', () => {
    const drawn = drawCell(
      cell(1, 1, { value: 5, bar: { color: '638EC6', fraction: 0.5, barOnly: false } }),
      undefined,
    );
    const bar = drawn.querySelector<HTMLElement>('.bar');

    expect(bar?.style.width).toBe('50%');
    expect(bar?.style.background).toBe('rgb(99, 142, 198)');
    expect(drawn.textContent).toContain('5');
  });

  it('hides the value behind the bar where the rule says to', () => {
    const drawn = drawCell(
      cell(1, 1, { value: 5, bar: { color: '638EC6', fraction: 1, barOnly: true } }),
      undefined,
    );

    expect(drawn.querySelector('.bar')).not.toBeNull();
    expect(drawn.textContent).toBe('');
  });
});
