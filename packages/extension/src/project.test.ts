import type { DataReader } from '@yxl-vscode/compile';
import type { IncludeReader } from '@yxl-vscode/loader';
import { filePath } from '@yxl-vscode/units';
import type { DrawnSheet } from '@yxl-vscode/webview/protocol';
import { describe, expect, it } from 'vitest';
import { project } from './project';

const FILE = '/specs/report.yxl.yaml';

/** A filesystem of one file, so the reader has something to say no to. */
const read: IncludeReader & DataReader = (_from, path) => {
  if (path !== 'sales.csv') return null;

  const file = filePath('/specs/sales.csv');
  return file === null ? null : { file, source: 'APAC,1\nEMEA,2\n' };
};

function drawn(source: string): DrawnSheet {
  const sheet = project(source, FILE, read).drawing.sheets[0];
  if (sheet === undefined) throw new Error('drew no sheet');
  return sheet;
}

function at(source: string, col: number, row: number) {
  return drawn(source).cells.find((cell) => cell.col === col && cell.row === row);
}

const SALES = 'sheets:\n  - name: Sales\n';

describe('a drawn spec', () => {
  it('names its sheets', () => {
    const drawing = project('sheets:\n  - name: Sales\n  - name: Notes\n', FILE, read).drawing;
    expect(drawing.sheets.map((sheet) => sheet.name)).toEqual(['Sales', 'Notes']);
  });

  it('draws a cell where the spec put it', () => {
    expect(at(`${SALES}    cells:\n      B2: Region\n`, 2, 2)?.value).toBe('Region');
  });

  it('draws a formula as its own text, having computed nothing', () => {
    const cell = at(`${SALES}    cells:\n      B2: { formula: "SUM(A1:A2)" }\n`, 2, 2);
    expect(cell?.formula).toBe('SUM(A1:A2)');
    expect(cell?.value).toBeNull();
  });

  it('carries the look a band gives a cell nothing wrote', () => {
    const source = `${SALES}    columns:\n      - at: A\n        style: { font: { bold: true } }\n    cells:\n      A1: x\n      B5: y\n`;
    expect(at(source, 1, 3)?.style).toEqual({ 'font.bold': true });
  });

  it('reaches only as far as the sheet holds something', () => {
    const sheet = drawn(`${SALES}    cells:\n      C4: x\n`);
    expect([sheet.columns, sheet.rows]).toEqual([3, 4]);
  });

  it('follows a filled range past the written cells, but not to the end of the sheet', () => {
    // `D2:D1048576` is a legal thing to write; drawing it out would be a million
    // rows of nothing.
    const sheet = drawn(`${SALES}    formulas:\n      - at: D2:D1048576\n        formula: "A2"\n`);
    expect(sheet.rows).toBe(50);
    expect(sheet.columns).toBe(4);
  });

  it('draws the rows of a file it was given a way to read', () => {
    const source = `${SALES}    data:\n      - at: A1\n        csv: sales.csv\n`;
    expect(at(source, 1, 2)?.value).toBe('EMEA');
    expect(project(source, FILE, read).diagnostics).toEqual([]);
  });

  it('says what it could not read, and draws the rest', () => {
    const source = `${SALES}    cells:\n      A1: 1\n    data:\n      - at: A5\n        csv: gone.csv\n`;
    const { drawing, diagnostics } = project(source, FILE, read);

    expect(diagnostics.map((one) => one.code)).toEqual(['compile.unreadable-data']);
    expect(drawing.diagnostics).toHaveLength(1);
    expect(drawing.sheets[0]?.cells).toHaveLength(1);
  });

  it('draws nothing but the reason when the file is not a spec', () => {
    const { drawing, diagnostics } = project('- not a mapping\n', FILE, read);
    expect(drawing.sheets).toEqual([]);
    expect(diagnostics.map((one) => one.code)).toEqual(['loader.not-a-mapping']);
  });

  it('carries the sizes and merges a sheet declares', () => {
    const source = `${SALES}    columns:\n      - at: B\n        width: 18\n    merges: [A1:C1]\n    cells:\n      A1: wide\n`;
    const sheet = drawn(source);
    expect(sheet.widths).toEqual([{ first: 2, last: 2, size: 18, hidden: false }]);
    expect(sheet.merges).toEqual([{ top: 1, left: 1, bottom: 1, right: 3 }]);
  });
});
