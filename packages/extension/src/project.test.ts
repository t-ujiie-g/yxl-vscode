import type { DataReader } from '@yxl-vscode/compile';
import type { IncludeReader } from '@yxl-vscode/loader';
import { filePath } from '@yxl-vscode/units';
import type { DrawnSheet } from '@yxl-vscode/webview/protocol';
import { describe, expect, it } from 'vitest';
import { project, redraw, type Windows } from './project';

const FILE = '/specs/report.yxl.yaml';

/** A filesystem of one file, so the reader has something to say no to. */
const read: IncludeReader & DataReader = (_from, path) => {
  if (path !== 'sales.csv') return null;

  const file = filePath('/specs/sales.csv');
  return file === null ? null : { file, source: 'APAC,1\nEMEA,2\n' };
};

function drawn(source: string, windows?: Windows): DrawnSheet {
  const sheet = project(source, FILE, read, new Map(), windows).drawing.sheets[0];
  if (sheet === undefined) throw new Error('drew no sheet');
  return sheet;
}

function at(source: string, col: number, row: number) {
  return drawn(source).cells.find((cell) => cell.col === col && cell.row === row);
}

const SALES = 'sheets:\n  - name: Sales\n';

/** A sheet twice as tall as one window, so a window is a window and not the lot. */
const TALL = `${SALES}    cells:\n${Array.from({ length: 400 }, (_, at) => `      A${at + 1}: ${at}`).join('\n')}\n`;

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
    // Excel shifts the references per cell, and nothing here does. Printing that text in every
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

  it('draws a window of a sheet, and says how far the sheet really reaches', () => {
    // Measured rather than guessed: the cost that does not survive a
    // hundred thousand cells is the DOM, not the projection.
    const sheet = drawn(TALL);

    expect([sheet.rows, sheet.at.row]).toEqual([200, 1]);
    expect(sheet.of.rows).toBe(400);
    expect(sheet.cells.every((cell) => cell.row <= 200)).toBe(true);
  });

  it('draws the window the view scrolled to, and nothing either side of it', () => {
    const sheet = drawn(TALL, new Map([['Sales', { row: 150, col: 1 }]]));

    expect(sheet.at.row).toBe(150);
    expect(sheet.cells.map((cell) => cell.row)).toEqual(
      Array.from({ length: 200 }, (_, at) => at + 150),
    );
  });

  it('keeps a window inside the sheet, however far the view asks to go', () => {
    // The last window is the last 200 rows, not 200 rows of nothing past the end.
    const sheet = drawn(TALL, new Map([['Sales', { row: 9000, col: 1 }]]));

    expect([sheet.at.row, sheet.rows]).toEqual([201, 200]);
  });

  it('draws a window of a sheet too small to fill one', () => {
    const sheet = drawn(
      `${SALES}    cells:\n      B2: x\n`,
      new Map([['Sales', { row: 5, col: 5 }]]),
    );
    expect([sheet.at.row, sheet.at.col, sheet.rows, sheet.columns]).toEqual([1, 1, 2, 2]);
  });

  it('draws the window at the sheet it belongs to, whatever number that sheet is now', () => {
    // The spec is read again with a sheet in front of the one being looked at.
    // A window kept by position would have moved to the newcomer.
    const before = `sheets:\n  - name: Summary\n${TALL.slice('sheets:\n'.length)}`;
    const windows = new Map([['Sales', { row: 150, col: 1 }]]);
    const { drawing } = project(before, FILE, read, new Map(), windows);

    expect(drawing.sheets.map((sheet) => [sheet.name, sheet.at.row])).toEqual([
      ['Summary', 1],
      ['Sales', 150],
    ]);
  });

  it('sends the view no node id, so nothing the view keeps can go stale', () => {
    // What the view holds across a read is what the reader pointed at — a sheet
    // by name, a cell by address (ADR-023). An id would be positional.
    const projected = project(TALL, FILE, read);
    const sent = JSON.stringify(projected.drawing);

    expect([...projected.nodes.keys()].filter((id) => sent.includes(id))).toEqual([]);
    expect(projected.nodes.size).toBeGreaterThan(0);
  });

  it('draws another window without reading or compiling the spec again', () => {
    const projected = project(TALL, FILE, read);
    const moved = redraw(projected, new Map(), new Map([['Sales', { row: 150, col: 1 }]]));

    expect(moved.sheets[0]?.at.row).toBe(150);
    expect(moved.sheets[0]?.cells[0]?.row).toBe(150);
    // Everything but the cells is the drawing it already had.
    expect(moved.diagnostics).toEqual(projected.drawing.diagnostics);
  });

  it('draws the same window as before when nothing has scrolled', () => {
    const projected = project(TALL, FILE, read);
    expect(redraw(projected, new Map(), new Map())).toEqual(projected.drawing);
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

  it('sends no size for a band that declared none, rather than a size of nothing', () => {
    // The view reads a size as a size; a `0` standing for "unsaid" draws a
    // column no cell can be seen in.
    const source = `${SALES}    columns:\n      - at: A\n        style: { font: { bold: true } }\n    cells:\n      A1: x\n`;
    expect(drawn(source).widths).toEqual([{ first: 1, last: 1, size: null, hidden: false }]);
  });

  it('carries the sizes and merges a sheet declares', () => {
    const source = `${SALES}    columns:\n      - at: B\n        width: 18\n    merges: [A1:C1]\n    cells:\n      A1: wide\n`;
    const sheet = drawn(source);
    expect(sheet.widths).toEqual([{ first: 2, last: 2, size: 18, hidden: false }]);
    expect(sheet.merges).toEqual([{ top: 1, left: 1, bottom: 1, right: 3 }]);
  });
});
