import type { Rect, SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { setFilter } from './filter';
import { files, tried } from './harness';

/** The filter set, through the checker — the file, or why not. */
function filtered(source: string, rect: Rect | null): string {
  const { doc, grid, read } = files(source);
  const intent = setFilter({ doc, grid }, { sheet: 'S' as SheetName, rect }, read);
  return tried(source, intent);
}

const SHEET = 'sheets:\n  - name: S\n    cells:\n      A1: Region\n';

describe('a sheet auto filter', () => {
  it('is written as the top row of the rectangle, which is the header Excel reads', () => {
    expect(filtered(SHEET, { top: 1, left: 1, bottom: 9, right: 4 })).toBe(
      `${SHEET}    filter: A1:D1\n`,
    );
  });

  it('replaces the one the sheet has, since a sheet has one filter', () => {
    const already = `${SHEET}    filter: A1:B1\n`;
    expect(filtered(already, { top: 2, left: 1, bottom: 2, right: 3 })).toBe(
      `${SHEET}    filter: A2:C2\n`,
    );
  });

  it('is taken off by the key going, and refused where there is none to take off', () => {
    const already = `${SHEET}    filter: A1:B1\n`;
    expect(filtered(already, null)).toBe(SHEET);
    expect(filtered(SHEET, null)).toBe('refused: `S` has no filter to take off');
  });
});
