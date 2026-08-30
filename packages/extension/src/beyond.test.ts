import { type CompiledGrid, type CompiledSheet, compile, finds } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import type { SpecDoc } from '@yxl-vscode/spec';
import { type A1Addr, addrAt } from '@yxl-vscode/units';
import type { Far } from '@yxl-vscode/webview/protocol';
import { describe, expect, it } from 'vitest';
import { asText } from './copying';
import { drawn, drawRun, extent } from './drawing';
import { edgeFrom } from './edges';
import { summed } from './summing';

/**
 * A sheet whose block runs well past the window the view is given (ADR-019), so
 * that an answer taken from the drawing rather than the sheet is visibly wrong
 * (`ROADMAP.md` Phase 17).
 */
const PAST = 400;

/** One column of numbers to `PAST`, with a word at the far end to find and to fit a column to. */
function spec(): { doc: SpecDoc; grid: CompiledGrid } {
  const rows = [...Array(PAST).keys()].map((at) => `      A${at + 1}: ${at + 1}`).join('\n');
  const source = `sheets:\n  - name: S\n    cells:\n${rows}\n      B${PAST}: a word past the window\n`;

  const { doc } = load(parse(source, { file: 'spec.yxl.yaml' }));
  if (doc === null) throw new Error('did not load');

  return { doc, grid: compile(doc) };
}

function sheet(): CompiledSheet {
  const one = spec().grid.sheets[0];
  if (one === undefined) throw new Error('compiled no sheet');
  return one;
}

/** The window the view is actually handed, which is what every answer below must not be limited to. */
function window(): { rows: number; columns: number } {
  const { doc, grid } = spec();
  const drawing = drawn(
    'spec.yxl.yaml',
    { doc, grid, nodes: new Map(), diagnostics: [], evaluation: null },
    new Map(),
    new Map(),
  );

  const one = drawing.sheets[0];
  if (one === undefined) throw new Error('drew no sheet');
  return { rows: one.rows, columns: one.columns };
}

const WHOLE = { top: 1, left: 1, bottom: PAST, right: 2 };

describe('what crosses the edge of the drawn window', () => {
  it('is drawn as a window, which is the premise of every case below', () => {
    // Without this the suite would pass on a view that was handed the sheet.
    expect(window().rows).toBeLessThan(PAST);
  });

  it('counts and adds every cell of the selection, not the ones drawn', () => {
    const comes = summed(sheet(), WHOLE, null);

    expect([comes.held, comes.sum]).toEqual([PAST + 1, (PAST * (PAST + 1)) / 2]);
  });

  it('copies every row of the rectangle, not the ones drawn', () => {
    const lines = asText(sheet(), WHOLE, null).split('\n');

    expect(lines.length).toBe(PAST);
    expect(lines[PAST - 1]).toBe(`${PAST}\ta word past the window`);
  });

  it('finds what is written past the window', () => {
    expect(finds(sheet(), 'past the window')).toEqual([addrAt({ col: 2, row: PAST })]);
  });

  it('walks to the end of the block, not to the end of the drawing', () => {
    const of = extent(sheet());
    const down: Far = { kind: 'block', rows: 1, cols: 0 };

    expect(edgeFrom(sheet(), of, 'A1' as A1Addr, down)).toBe(`A${PAST}`);
  });

  it('goes to the sheet’s own corner, wherever the drawing stops', () => {
    const of = extent(sheet());

    expect(edgeFrom(sheet(), of, 'A1' as A1Addr, { kind: 'sheet' })).toBe(`B${PAST}`);
  });

  it('measures a column over every cell in it, not the ones drawn', () => {
    const run = drawRun(sheet(), 'column', 2, null);

    expect(run.map((one) => one.value)).toEqual(['a word past the window']);
  });
});
