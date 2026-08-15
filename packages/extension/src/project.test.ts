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

  it('says where a filled cell reads from, rather than a formula that is wrong there', () => {
    // The range holds one formula, written as it applies at its anchor, and
    // Excel shifts the references per cell (§8 Q2). Printing that text in every
    // cell of the range would print something false in all but one.
    const source = `${SALES}    formulas:\n      - at: C2:C3\n        formula: "B2*0.05"\n`;
    expect(at(source, 3, 2)).toMatchObject({ formula: 'B2*0.05', filledFrom: null });
    expect(at(source, 3, 3)).toMatchObject({ formula: 'B2*0.05', filledFrom: 'C2' });
  });

  it('draws the spec as the parameters the reader set, not only as its defaults', () => {
    const source = `params:\n  region: APAC\n${SALES}    cells:\n      A1: "\${region}"\n`;
    const set = new Map([['region', 'EMEA']]);

    expect(project(source, FILE, read).drawing.sheets[0]?.cells[0]?.value).toBe('APAC');
    expect(project(source, FILE, read, set).drawing.sheets[0]?.cells[0]?.value).toBe('EMEA');
  });

  it('reads a set value as the scalar it looks like, as `--set` does', () => {
    const source = `params:\n  rate: 0.085\n${SALES}    cells:\n      A1: "\${rate}"\n`;
    const set = new Map([['rate', '0.15']]);

    expect(project(source, FILE, read, set).drawing.sheets[0]?.cells[0]?.value).toBe(0.15);
  });

  it('lists the parameters a reader may turn, and which are turned', () => {
    const source = `params:\n  region: APAC\n  quarter: Q3\n${SALES}    cells:\n      A1: x\n`;
    const { drawing } = project(source, FILE, read, new Map([['region', 'EMEA']]));

    expect(drawing.params).toEqual([
      { name: 'region', value: 'EMEA', set: true },
      { name: 'quarter', value: 'Q3', set: false },
    ]);
  });

  it('says so when a set parameter is not one the spec declares', () => {
    const source = `params:\n  region: APAC\n${SALES}    cells:\n      A1: x\n`;
    const { diagnostics } = project(source, FILE, read, new Map([['reigon', 'EMEA']]));

    expect(diagnostics.map((one) => one.code)).toEqual(['compile.no-such-param']);
  });

  it('gives a cell the number format that applies to it', () => {
    const source = `${SALES}    cells:\n      A1: { value: 0.085, format: "0.0%" }\n`;
    expect(at(source, 1, 1)?.format).toBe('0.0%');
  });

  it('lets a band give a number its format', () => {
    const source = `${SALES}    columns:\n      - at: B\n        format: "#,##0"\n    cells:\n      B2: 2400000\n`;
    expect(at(source, 2, 2)?.format).toBe('#,##0');
  });

  it('keeps an inherited format off a text cell, as Excel does', () => {
    // `docs/spec.md` §4: a code with fewer than four sections says nothing about
    // text, so a band's format leaves a heading alone.
    const source = `${SALES}    columns:\n      - at: B\n        format: "#,##0"\n    cells:\n      B1: Revenue\n      B2: 2400000\n`;
    expect(at(source, 2, 1)?.format).toBeNull();
    expect(at(source, 2, 2)?.format).toBe('#,##0');
  });

  it('honours a format written on the text cell itself, which is a request', () => {
    const source = `${SALES}    cells:\n      B1: { value: Revenue, format: "@" }\n`;
    expect(at(source, 2, 1)?.format).toBe('@');
  });

  it('draws a page of a sheet, and says how far the sheet really reaches', () => {
    // Measured rather than guessed (§9 R5): the cost that does not survive a
    // hundred thousand cells is the DOM, not the projection.
    const rows = Array.from({ length: 400 }, (_, at) => `      A${at + 1}: ${at}`).join('\n');
    const sheet = drawn(`${SALES}    cells:\n${rows}\n`);

    expect(sheet.rows).toBe(200);
    expect(sheet.of.rows).toBe(400);
    expect(sheet.cells.every((cell) => cell.row <= 200)).toBe(true);
  });

  it('marks the cells a diagnostic is about', () => {
    // The node at the diagnostic's span is the cause; the cells it reaches are
    // where a reader sees the effect.
    const source = `${SALES}    cells:\n      A1: { $ref: nosuch }\n      B1: fine\n`;
    const sheet = drawn(source);

    expect(sheet.problems).toEqual([
      { row: 1, col: 1, message: 'no value is declared as `nosuch`' },
    ]);
  });

  it('leaves a diagnostic that reaches no cell to the list', () => {
    const source = `${SALES}    columns:\n      - at: nonsense\n        width: 2\n`;
    const { drawing } = project(source, FILE, read);

    expect(drawing.sheets[0]?.problems).toEqual([]);
    expect(drawing.diagnostics).toHaveLength(1);
  });

  it('carries the sizes and merges a sheet declares', () => {
    const source = `${SALES}    columns:\n      - at: B\n        width: 18\n    merges: [A1:C1]\n    cells:\n      A1: wide\n`;
    const sheet = drawn(source);
    expect(sheet.widths).toEqual([{ first: 2, last: 2, size: 18, hidden: false }]);
    expect(sheet.merges).toEqual([{ top: 1, left: 1, bottom: 1, right: 3 }]);
  });
});
