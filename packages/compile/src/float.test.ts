import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { codes, sheet } from './harness';

const SHEET = 'sheets:\n  - name: Figures\n';

describe('a compiled chart', () => {
  it('reads the anchor and keeps what it plots as the spec wrote it', () => {
    const source = `${SHEET}    charts:\n      - at: E2\n        type: column\n        title: Revenue\n        series:\n          - values: B2:B4\n            categories: A2:A4\n            name_from: B1\n`;
    const one = sheet(source).charts[0];
    expect(one?.at).toBe('E2');
    expect(one?.title).toBe('Revenue');
    expect(one?.series[0]).toMatchObject({
      values: 'B2:B4',
      categories: 'A2:A4',
      name: null,
      nameFrom: { sheet: null, at: 'B1' },
    });
  });

  it('keeps the sheet a series names, so a chart may plot another tab', () => {
    const source = `${SHEET}    charts:\n      - at: A3\n        type: bar\n        series:\n          - values: Figures!C2:C4\n            name_from: Figures!C1\n`;
    expect(sheet(source).charts[0]?.series[0]?.nameFrom).toEqual({ sheet: 'Figures', at: 'C1' });
  });

  it('substitutes a parameter in the anchor', () => {
    const source = `params:\n  where: E2\n${SHEET}    charts:\n      - at: \${where}\n        type: pie\n        series:\n          - values: B2:B4\n`;
    expect(sheet(source).charts[0]?.at).toBe('E2');
  });

  it('refuses an anchor a parameter did not make a cell, and a `name_from` that is not one', () => {
    const bad = `params:\n  where: nowhere\n${SHEET}    charts:\n      - at: \${where}\n        type: pie\n        series:\n          - values: B2:B4\n`;
    expect(codes(bad)).toContain(CODE.badAddress);
    expect(sheet(bad).charts).toEqual([]);

    const named = `${SHEET}    charts:\n      - at: E2\n        type: pie\n        series:\n          - values: B2:B4\n            name_from: B1:B2\n`;
    expect(codes(named)).toContain(CODE.badAddress);
  });
});

describe('a compiled image', () => {
  it('reads the anchor and gives an unwritten scale, offset and positioning their defaults', () => {
    const source = `${SHEET}    images:\n      - at: E1\n        file: assets/logo.png\n`;
    expect(sheet(source).images[0]).toMatchObject({
      at: 'E1',
      path: 'assets/logo.png',
      alt: null,
      scale: { x: 1, y: 1 },
      offset: { x: 0, y: 0 },
      positioning: 'move',
    });
  });
});

describe('a compiled shape', () => {
  it('is 160 by 160 where it asks for no size', () => {
    const source = `${SHEET}    shapes:\n      - at: E2\n        kind: cloud\n`;
    expect(sheet(source).shapes[0]?.size).toEqual({ width: 160, height: 160 });
  });

  it('reads its colours, and its text with the look each line wears', () => {
    const source = `${SHEET}    shapes:\n      - at: E2\n        kind: pie\n        fill: "1F77B4"\n        line: { color: "333333", width: 2 }\n        text:\n          - { text: Approved, font: { bold: true } }\n`;
    const one = sheet(source).shapes[0];
    expect(one?.fill).toBe('1F77B4');
    expect(one?.line).toEqual({ color: '333333', width: 2 });
    expect(one?.text).toEqual([{ text: 'Approved', look: { 'font.bold': true } }]);
  });
});

describe('a compiled sparkline group', () => {
  it('becomes one sparkline per cell, each carrying the group its look came from', () => {
    const source = `${SHEET}    sparklines:\n      - cells:\n          - { at: G2, data: B2:E2 }\n          - { at: G3, data: B3:E3 }\n        type: column\n        color: "1F77B4"\n`;
    const drawn = sheet(source).sparklines;
    expect(drawn.map((one) => one.at)).toEqual(['G2', 'G3']);
    expect(drawn.every((one) => one.type === 'column' && one.color === '1F77B4')).toBe(true);
  });

  it('reads the range it plots, and the sheet it names where it names one', () => {
    const source = `${SHEET}    sparklines:\n      - at: F2\n        data: Results!B2:E2\n  - name: Results\n`;
    expect(sheet(source).sparklines[0]?.data).toEqual({
      sheet: 'Results',
      rect: { top: 2, left: 2, bottom: 2, right: 5 },
    });
  });

  it('refuses a range it cannot read, and draws nothing of that sparkline', () => {
    const source = `${SHEET}    sparklines:\n      - at: F2\n        data: not a range\n`;
    expect(codes(source)).toContain(CODE.badRange);
    expect(sheet(source).sparklines).toEqual([]);
  });
});
