// @vitest-environment jsdom

import { type Color, parseColor } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { drawCell, typeInto } from './cell';
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

  it('reads a colour with an alpha byte, which CSS wants last', () => {
    // `FF00FF00` is opaque green in Excel's `AARRGGBB`. Handed to CSS as
    // written it would be transparent magenta, so the answer being green is
    // the reordering working.
    const drawn = drawCell(cell({ value: 'x', style: { fill: colour('FF00FF00') } }), undefined);
    expect(drawn.style.backgroundColor).toBe('rgb(0, 255, 0)');
  });

  it('draws each border edge it was given', () => {
    const style = {
      'border.top.style': 'thick',
      'border.top.color': colour('FF0000'),
    } as const;
    const drawn = drawCell(cell({ value: 'x', style }), undefined);

    expect(drawn.style.borderTop).toBe('3px solid rgb(255, 0, 0)');
  });

  it('draws an edge with no colour of its own in the text colour', () => {
    const drawn = drawCell(cell({ value: 'x', style: { 'border.left.style': 'hair' } }), undefined);
    // jsdom's CSSOM drops the `currentColor` keyword when it serializes the
    // shorthand back; a browser keeps it, and either way no colour was chosen.
    expect(drawn.style.borderLeft).toBe('0.5px solid');
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
    return at.querySelector<HTMLInputElement>('.typing')?.value ?? '';
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
