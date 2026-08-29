import type { A1Addr, SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { english, files, tried } from './harness';
import { setRun } from './rich';

/** The run retyped, through the checker — the file as it stands after it, or why not. */
function retyped(source: string, at: string, index: number, text: string): string {
  const { doc, grid, read } = files(source);
  const where = { sheet: 'S' as SheetName, at: at as A1Addr, index, text };
  const intent = setRun({ doc, grid }, where, read);
  return tried(source, intent);
}

const SHEET = 'sheets:\n  - name: S\n    cells:\n';
const RICH = `${SHEET}      A1:\n        rich:\n          - "Figures are "\n          - { text: unaudited, font: { italic: true } }\n`;

describe('a run of a rich cell', () => {
  it('is retyped where it is written as a bare string', () => {
    expect(retyped(RICH, 'A1', 0, 'Numbers are ')).toBe(RICH.replace('Figures are', 'Numbers are'));
  });

  it('is retyped under `text` where the run wears a font, which stays', () => {
    expect(retyped(RICH, 'A1', 1, 'provisional')).toBe(
      RICH.replace('text: unaudited', 'text: provisional'),
    );
  });

  it('leaves every other byte of the file alone', () => {
    const after = retyped(`${RICH}      B1: 42     # counted by hand\n`, 'A1', 0, 'Numbers are ');
    expect(after).toContain('B1: 42     # counted by hand');
  });

  it('refuses a run that is not there, and a run with nothing to say', () => {
    expect(retyped(RICH, 'A1', 2, 'third')).toBe('refused: `A1` has 2 runs, and no run 3');
    expect(retyped(RICH, 'A1', 0, '')).toBe('refused: a run needs something to say');
  });

  it('refuses a cell that holds no runs, and a sheet that is not there', () => {
    expect(retyped(`${SHEET}      A1: Region\n`, 'A1', 0, 'EMEA')).toBe(
      'refused: `A1` holds no rich text',
    );

    const { doc, grid, read } = files(RICH);
    const where = { sheet: 'Other' as SheetName, at: 'A1' as A1Addr, index: 0, text: 'x' };
    const intent = setRun({ doc, grid }, where, read);
    expect(intent.kind === 'refused' && english(intent.why)).toBe(
      'there is no sheet named `Other`',
    );
  });

  it('refuses a run that reads a parameter, which typing over would take away', () => {
    const said = `params:\n  - name: quarter\n    value: Q3\n${SHEET}      A1:\n        rich:\n          - "Figures for \${quarter}"\n`;
    expect(retyped(said, 'A1', 0, 'Figures for Q4')).toBe(
      'refused: run 1 of `A1` reads a parameter',
    );
  });

  it('refuses a run written as something other than text', () => {
    const said = `${SHEET}      A1:\n        rich:\n          - { text: [a], font: { bold: true } }\n`;
    expect(retyped(said, 'A1', 0, 'plain')).toBe('refused: run 1 of `A1` is not written as text');
  });

  it('is retyped where an override writes the runs, since that is what the cell holds', () => {
    const said = `${SHEET}      A1: Region\noverrides:\n  - at: S!A1\n    rich:\n      - "Figures are "\n    reason: restated\n`;
    expect(retyped(said, 'A1', 0, 'Numbers are ')).toBe(said.replace('Figures are', 'Numbers are'));
  });
});
