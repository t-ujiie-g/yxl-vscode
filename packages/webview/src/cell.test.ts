// @vitest-environment jsdom

import { type Color, parseColor } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { drawCell, typeInto, underFormat } from './cell';
import type { DrawnCell } from './protocol';

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
    bar: null,
    icon: null,
    ...of,
  };
}

/** A colour, branded the way the projection would have branded it. */
function colour(hex: string): Color {
  const read = parseColor(hex);
  if (read === null) throw new Error(`not a colour: ${hex}`);
  return read;
}

describe('what a cell says', () => {
  it('shows the value the spec put there', () => {
    expect(drawCell(cell({ value: 'APAC' }), undefined).textContent).toBe('APAC');
  });

  it('shows a number under its format', () => {
    expect(drawCell(cell({ value: 0.085, format: '0.0%' }), undefined).textContent).toBe('8.5%');
  });

  it('shows a formula as its own text, having computed nothing', () => {
    expect(drawCell(cell({ formula: 'SUM(A1:A2)' }), undefined).textContent).toBe('=SUM(A1:A2)');
  });

  it('shows the cached result Excel would show, over the formula that produced it', () => {
    const drawn = drawCell(cell({ value: 12, formula: 'SUM(A1:A2)' }), undefined);
    expect([drawn.textContent, drawn.title]).toEqual(['12', '=SUM(A1:A2)']);
  });

  it('shows a filled cell its own formula, and says on hover where it is filled from', () => {
    const drawn = drawCell(cell({ formula: 'B3*0.05', filledFrom: 'C2' }), undefined);

    expect(drawn.textContent).toBe('=B3*0.05');
    expect(drawn.classList.contains('filled')).toBe(true);
    expect(drawn.title).toBe('=B3*0.05 — filled from C2');
  });

  it('shows what a formula came to, with the formula a hover away', () => {
    const drawn = drawCell(
      cell({ formula: 'SUM(B2:B3)', computed: { kind: 'value', value: 4150000 } }),
      undefined,
    );

    expect(drawn.textContent).toBe('4150000');
    expect(drawn.title).toBe('=SUM(B2:B3)');
  });

  it('shows a computed number under the format the cell wears', () => {
    const computed = { kind: 'value', value: 0.085 } as const;
    expect(drawCell(cell({ formula: 'x', computed, format: '0.0%' }), undefined).textContent).toBe(
      '8.5%',
    );
  });

  it("shows Excel's own error text, marked as a problem", () => {
    const drawn = drawCell(
      cell({ formula: '1/0', computed: { kind: 'error', error: '#DIV/0!' } }),
      undefined,
    );

    expect(drawn.textContent).toBe('#DIV/0!');
    expect(drawn.classList.contains('problem')).toBe(true);
  });

  it('falls back to the formula when nothing could be computed, never to a number', () => {
    const computed = { kind: 'unsupported', why: 'this function answers asynchronously' } as const;
    const drawn = drawCell(cell({ formula: 'WEBSERVICE(A1)', computed }), undefined);

    expect(drawn.textContent).toBe('=WEBSERVICE(A1)');
    expect(drawn.title).toContain('not computed');
  });

  it('shows a filled cell its own result rather than where it reads from', () => {
    // The marker is what a cell of a range says when nothing computed it; with
    // a value there is a value to show, and the story stays on the hover.
    const computed = { kind: 'value', value: 10 } as const;
    const drawn = drawCell(cell({ formula: 'B2*0.05', filledFrom: 'C2', computed }), undefined);

    expect(drawn.textContent).toBe('10');
    expect(drawn.title).toContain('filled from C2');
  });

  it('shows a cell written in runs as its runs, each wearing its own font', () => {
    const drawn = drawCell(
      cell({
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
    expect(drawCell(cell({ style: { 'font.bold': true } }), undefined).textContent).toBe('');
  });

  it('shows a pattern the formatter cannot read as its own error, keeping the view', () => {
    expect(drawCell(cell({ value: 1, format: 'nonsense' }), undefined).textContent).toContain('#');
  });
});

describe('what a cell looks like', () => {
  it('wears the weight, the fill, and the alignment it was given', () => {
    const style = {
      'font.bold': true,
      fill: colour('FFFF00'),
      'align.horizontal': 'center',
    } as const;
    const drawn = drawCell(cell({ value: 'x', style }), undefined);

    expect(drawn.style.fontWeight).toBe('bold');
    expect(drawn.style.backgroundColor).toBe('rgb(255, 255, 0)');
    expect(drawn.style.textAlign).toBe('center');
  });

  it('drops the alpha byte of a colour, whichever byte it is', () => {
    // Excel ignores it: `0000FF00` is the same opaque green as `FF00FF00`, and
    // a `00` handed to CSS would be an invisible cell.
    const opaque = drawCell(cell({ value: 'x', style: { fill: colour('FF00FF00') } }), undefined);
    expect(opaque.style.backgroundColor).toBe('rgb(0, 255, 0)');

    const clear = drawCell(cell({ value: 'x', style: { fill: colour('0000FF00') } }), undefined);
    expect(clear.style.backgroundColor).toBe('rgb(0, 255, 0)');
  });

  it('draws each border edge it was given', () => {
    const style = {
      'border.top.style': 'thick',
      'border.top.color': colour('FF0000'),
    } as const;
    const over = drawCell(cell({ value: 'x', style }), undefined).querySelector<HTMLElement>(
      '.edges',
    );

    expect(over?.style.borderTop).toBe('3px solid rgb(255, 0, 0)');
  });

  it('draws an edge with no colour of its own in the text colour', () => {
    const drawn = drawCell(cell({ value: 'x', style: { 'border.left.style': 'hair' } }), undefined);
    // jsdom's CSSOM drops the `currentColor` keyword when it serializes the
    // shorthand back; a browser keeps it, and either way no colour was chosen.
    expect(drawn.querySelector<HTMLElement>('.edges')?.style.borderLeft).toBe('0.5px solid');
  });
});

describe('a cell the reader cannot type into', () => {
  it('is marked, so the reader knows before they try rather than after', () => {
    const drawn = drawCell(cell({ value: 1, editable: 'external' }), undefined);

    expect(drawn.classList.contains('locked')).toBe(true);
    expect(drawn.title).toContain('a file beside the spec');
  });

  it('says which of the two things stands in the way', () => {
    const drawn = drawCell(cell({ value: 1, editable: 'mediated' }), undefined);
    expect(drawn.title).toContain('more than one thing could change');
  });

  it('is not marked when one node of the spec says it', () => {
    expect(drawCell(cell({ value: 1 }), undefined).classList.contains('locked')).toBe(false);
  });

  it('keeps the two marks apart: an exception made, and one the spec makes', () => {
    const drawn = drawCell(cell({ value: 1, overridden: true }), undefined);

    expect(drawn.classList.contains('overridden')).toBe(true);
    expect(drawn.classList.contains('locked')).toBe(false);
    expect(drawn.title).toContain('written as an override');
  });
});

describe('a cell that anchors a merge', () => {
  it('spans the region, which is how Excel shows one value across it', () => {
    const drawn = drawCell(cell({ value: 'wide' }), { top: 1, left: 1, bottom: 2, right: 3 });
    expect([drawn.colSpan, drawn.rowSpan]).toEqual([3, 2]);
  });

  it('spans nothing when nothing is merged there', () => {
    const drawn = drawCell(cell({ value: 'x' }), undefined);
    expect([drawn.colSpan, drawn.rowSpan]).toEqual([1, 1]);
  });
});

describe('the box a reader types in', () => {
  function box(of: Partial<DrawnCell>): string {
    const at = document.createElement('td');
    typeInto(at, cell(of), undefined, () => {});
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

describe('the borders a cell wears', () => {
  const edges = (of: Partial<DrawnCell>) => drawCell(cell(of), undefined).querySelector('.edges');

  it('are drawn over the grid own lines rather than on the cell itself', () => {
    const drawn = drawCell(cell({ style: { 'border.left.style': 'thin' } }), undefined);

    expect(drawn.style.borderLeft).toBe('');
    expect(drawn.querySelector<HTMLElement>('.edges')?.style.borderLeft).toBe('1px solid');
  });

  it('are one element for every edge the cell has', () => {
    const over = edges({
      style: { 'border.top.style': 'thin', 'border.bottom.style': 'double' },
    });

    expect(over?.getAttribute('style')).toBe('border-top: 1px solid; border-bottom: 2px solid;');
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

describe('what a format would make of the number a cell shows', () => {
  it('is the number the spec holds, under the code asked about', () => {
    expect(underFormat(cell({ value: 1234.5678 }), '#,##0.00')).toBe('1,234.57');
  });

  it('is what a formula was computed to, since that is the number on screen (ADR-014)', () => {
    const of = cell({ value: null, computed: { kind: 'value', value: 0.085 } });

    expect(underFormat(of, '0.0%')).toBe('8.5%');
  });

  it('is nothing where the cell holds no number to make anything of', () => {
    expect(underFormat(cell({ value: 'APAC' }), '#,##0')).toBeNull();
    expect(underFormat(cell({ value: null }), '#,##0')).toBeNull();
  });
});

describe('a cell a data bar reaches', () => {
  it('draws the bar behind the value, as wide as the fraction says', () => {
    const drawn = drawCell(
      cell({ value: 5, bar: { color: '638EC6', fraction: 0.5, barOnly: false } }),
      undefined,
    );
    const bar = drawn.querySelector<HTMLElement>('.bar');

    expect(bar?.style.width).toBe('50%');
    expect(bar?.style.background).toBe('rgb(99, 142, 198)');
    expect(drawn.textContent).toContain('5');
  });

  it('hides the value behind the bar where the rule says to', () => {
    const drawn = drawCell(
      cell({ value: 5, bar: { color: '638EC6', fraction: 1, barOnly: true } }),
      undefined,
    );

    expect(drawn.querySelector('.bar')).not.toBeNull();
    expect(drawn.textContent).toBe('');
  });
});
