import { type CompiledSheet, compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import { type A1Addr, addrAt } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { extent } from './drawing';
import { edgeFrom, type Step } from './edges';

const DOWN: Step = { rows: 1, cols: 0 };
const UP: Step = { rows: -1, cols: 0 };
const RIGHT: Step = { rows: 0, cols: 1 };

function sheet(body: string): CompiledSheet {
  const { doc } = load(
    parse(`sheets:\n  - name: S\n    cells:\n${body}`, { file: 'spec.yxl.yaml' }),
  );
  if (doc === null) throw new Error('did not load');

  const one = compile(doc).sheets[0];
  if (one === undefined) throw new Error('compiled no sheet');
  return one;
}

/** Where a `Cmd`+arrow from `at` lands on a sheet written with that body. */
function edge(body: string, at: string, by: Step): string {
  const one = sheet(body);
  return edgeFrom(one, extent(one), at as A1Addr, by);
}

/** A column of `many` cells, which is longer than any window the view draws. */
function column(many: number): string {
  return Array.from({ length: many }, (_, index) => `      A${index + 1}: ${index + 1}\n`).join('');
}

describe('where a `Cmd`+arrow lands', () => {
  it('runs to the far end of a block, however long the block is', () => {
    // The view draws a window of about fifty rows (ADR-019); this is four
    // hundred, which is the case a reader hit and a window cannot see the end of.
    expect(edge(column(400), 'A1', DOWN)).toBe('A400');
  });

  it('crosses the gap to the next thing, where it starts beside nothing', () => {
    const spec = '      A1: one\n      A5: five\n      A6: six\n';
    expect(edge(spec, 'A1', DOWN)).toBe('A5');
  });

  it('stops at the far end of that one, rather than running on to the sheet edge', () => {
    const spec = '      A1: one\n      A5: five\n      A6: six\n';
    expect(edge(spec, 'A5', DOWN)).toBe('A6');
  });

  it("goes to the sheet's own edge where there is nothing to run to, and stays where it has none", () => {
    // Rightwards from a cell with nothing beside it, as Excel does; the sheet's
    // edge is how far it is drawn, which is what it writes and room to work in.
    const of = extent(sheet(column(3)));
    expect(edge(column(3), 'A2', RIGHT)).toBe(addrAt({ col: of.columns, row: 2 }));

    expect(edge(column(3), 'A1', UP)).toBe('A1');
  });

  it('runs to the last of a block from inside it, not to the one beyond', () => {
    expect(edge(column(400), 'A200', DOWN)).toBe('A400');
    expect(edge(column(400), 'A200', UP)).toBe('A1');
  });
});
