import type { DataReader } from '@yxl-vscode/compile';
import { univerEngine } from '@yxl-vscode/evaluate';
import type { IncludeReader } from '@yxl-vscode/loader';
import type { DrawnSheet } from '@yxl-vscode/webview/protocol';
import { describe, expect, it } from 'vitest';
import type { PictureReader } from './pictures';
import { project, type Windows } from './project';

const FILE = '/specs/report.yxl.yaml';

const read: IncludeReader & DataReader = () => null;

/** A filesystem of one picture, so the measurer has something to say no to. */
const pictures: PictureReader = (_from, path) =>
  path === 'assets/logo.png' ? { width: 120, height: 60 } : null;

function drawn(source: string, windows?: Windows): DrawnSheet {
  const sheet = project(source, FILE, read, new Map(), windows, undefined, pictures).drawing
    .sheets[0];
  if (sheet === undefined) throw new Error('drew no sheet');
  return sheet;
}

function computed(source: string): DrawnSheet {
  const sheet = project(source, FILE, read, new Map(), new Map(), univerEngine(), pictures).drawing
    .sheets[0];
  if (sheet === undefined) throw new Error('drew no sheet');
  return sheet;
}

const FIGURES =
  'sheets:\n  - name: Figures\n    cells:\n      A1: Region\n      B1: Revenue\n      B2: 10\n      B3: 20\n      B4: 30\n';

describe('a chart handed to the view', () => {
  it('sits at its anchor, at the size it asks for, named as the spec names it', () => {
    const source = `${FIGURES}    charts:\n      - at: E2\n        type: column\n        title: Revenue\n        legend: right\n        size: { width: 520, height: 300 }\n        series:\n          - values: B2:B4\n            categories: A2:A4\n            name_from: B1\n`;
    const one = drawn(source).charts[0];
    expect(one?.at).toEqual({ row: 2, col: 5, x: 0, y: 0 });
    expect(one?.size).toEqual({ width: 520, height: 300 });
    expect(one?.title).toBe('Revenue');
    expect(one?.legend).toBe('right');
    expect(one?.series).toEqual([{ name: 'Revenue', values: 'B2:B4', categories: 'A2:A4' }]);
  });

  it('takes the size and the legend yxl gives a chart that asks for neither', () => {
    const source = `${FIGURES}    charts:\n      - at: E2\n        type: pie\n        series:\n          - values: B2:B4\n`;
    const one = drawn(source).charts[0];
    expect(one?.size).toEqual({ width: 480, height: 260 });
    expect(one?.legend).toBe('bottom');
    expect(one?.series[0]?.name).toBeNull();
  });
});

describe('an image handed to the view', () => {
  it('takes the room its own file says, times the scale the spec asks for', () => {
    const source = `${FIGURES}    images:\n      - at: E1\n        file: assets/logo.png\n        scale: 0.5\n        offset: { x: 4, y: 6 }\n`;
    const one = drawn(source).images[0];
    expect(one?.size).toEqual({ width: 60, height: 30 });
    expect(one?.at).toEqual({ row: 1, col: 5, x: 4, y: 6 });
    expect(one?.why).toBeNull();
  });

  it('says why it has no extent where the file cannot be measured', () => {
    const source = `${FIGURES}    images:\n      - at: E1\n        file: art/plan.emf\n`;
    const one = drawn(source).images[0];
    expect(one?.size).toBeNull();
    expect(one?.why).toContain('this format');
  });

  it('says the file could not be read where the format is one it does read', () => {
    const source = `${FIGURES}    images:\n      - at: E1\n        file: art/gone.png\n`;
    expect(drawn(source).images[0]?.why).toContain('could not be read');
  });
});

describe('a shape handed to the view', () => {
  it('carries its geometry, its colours, and the look each line of text wears', () => {
    const source = `${FIGURES}    shapes:\n      - at: E2\n        kind: cloud\n        fill: "1F77B4"\n        line: { color: "333333", width: 2 }\n        text:\n          - { text: Approved, font: { bold: true } }\n`;
    const one = drawn(source).shapes[0];
    expect(one?.kind).toBe('cloud');
    expect(one?.fill).toBe('#1F77B4');
    expect(one?.line).toEqual({ color: '#333333', width: 2 });
    expect(one?.text).toEqual([{ text: 'Approved', style: { 'font.bold': true } }]);
  });

  it('has no line where the spec gives it none, which is a shape Excel draws nothing of', () => {
    const source = `${FIGURES}    shapes:\n      - at: E2\n        kind: pie\n`;
    expect(drawn(source).shapes[0]?.line).toBeNull();
    expect(drawn(source).shapes[0]?.fill).toBeNull();
  });
});

describe('a sparkline handed to the view', () => {
  it('rides on the cell it sits in, with the points the sheet writes', () => {
    const source = `${FIGURES}    sparklines:\n      - at: F2\n        data: B2:B4\n        type: column\n        high: true\n`;
    const cell = drawn(source).cells.find((one) => one.row === 2 && one.col === 6);
    expect(cell?.sparkline?.points).toEqual([10, 20, 30]);
    expect(cell?.sparkline?.type).toBe('column');
    expect(cell?.sparkline?.high).toBe(true);
  });

  it('plots the computed value where a cell holds a formula (ADR-014)', () => {
    const source = `${FIGURES}      C2: { formula: "B2*2" }\n    sparklines:\n      - at: F2\n        data: C2:C2\n`;
    const cell = computed(source).cells.find((one) => one.row === 2 && one.col === 6);
    expect(cell?.sparkline?.points).toEqual([20]);
  });

  it('leaves a point of a cell that holds no number empty', () => {
    const source = `${FIGURES}    sparklines:\n      - at: F2\n        data: A1:A2\n`;
    const cell = drawn(source).cells.find((one) => one.row === 2 && one.col === 6);
    expect(cell?.sparkline?.points).toEqual([null, null]);
  });
});

describe('a sheet with something floating over it', () => {
  it('is drawn far enough down and across to show what hangs off a cell past its own', () => {
    const source = `${FIGURES}    charts:\n      - at: Z90\n        type: pie\n        series:\n          - values: B2:B4\n`;
    const sheet = drawn(source);
    expect(sheet.of.rows).toBeGreaterThanOrEqual(90);
    expect(sheet.of.columns).toBeGreaterThanOrEqual(26);
  });
});

describe("a sheet's print setup handed to the view", () => {
  it('carries the area and the breaks, and says the rest in a sentence', () => {
    const source = `${FIGURES}    print:\n      area: A1:D50\n      orientation: landscape\n      scale: 80\n      breaks: [A21]\n      header: "&CQuarterly"\n`;
    const print = drawn(source).print;
    expect(print?.area).toEqual({ top: 1, left: 1, bottom: 50, right: 4 });
    expect(print?.breaks).toEqual([{ row: 21, col: 1 }]);
    expect(print?.says).toContain('A1:D50 prints, landscape, scaled to 80%');
    expect(print?.says).toContain('header `&CQuarterly`');
    expect(print?.says).toContain('does not paginate');
  });

  it('says the whole sheet prints where no area is named, and how it is fitted', () => {
    const source = `${FIGURES}    print:\n      fit: { width: 1, height: 0 }\n`;
    expect(drawn(source).print?.says).toContain('The whole sheet prints, fitted to 1 page across');
  });
});

describe("a sheet's protection handed to the view", () => {
  it('says what Excel will do, what it will still allow, and never the password', () => {
    const source = `${FIGURES}    protect:\n      password: hunter2\n      allow: { sort: true, auto_filter: true }\n`;
    const protect = drawn(source).protect;
    expect(protect?.says).toContain(
      'When Excel opens this sheet it will protect it behind a password',
    );
    expect(protect?.says).toContain('still be allowed: sort, auto filter.');
    expect(JSON.stringify(protect)).not.toContain('hunter2');
  });

  it("says Excel's own default where the spec allows nothing by name", () => {
    const source = `${FIGURES}    protect: {}\n`;
    const says = drawn(source).protect?.says ?? '';
    expect(says).toContain('it will protect it.');
    expect(says).toContain("only selecting — Excel's own default");
  });

  it('says the lock is about the workbook rather than about editing the spec here', () => {
    const says = drawn(`${FIGURES}    protect: {}\n`).protect?.says ?? '';
    expect(says).toContain('your readers will be able to type into');
    expect(says).toContain('Editing the spec here is unaffected.');
  });
});
