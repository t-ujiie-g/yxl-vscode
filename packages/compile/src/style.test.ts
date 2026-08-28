import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { codes, layers, sheet } from './harness';
import { resolve, settled } from './style';

function looks(source: string, at: string) {
  return resolve(layers(source, at));
}

const SHEET = 'sheets:\n  - name: Sales\n';

describe('a style layer', () => {
  it('holds only what it set', () => {
    const source = `${SHEET}    cells:\n      A1: { value: 1, style: { font: { bold: true } } }\n`;
    expect(layers(source, 'A1')).toEqual([
      {
        through: 'cell',
        key: 'style',
        node: '["spec.yxl.yaml","sheets",0,"cells","A1"]',
        name: null,
        gives: { 'font.bold': true },
      },
    ]);
  });

  it('names the definition it came from', () => {
    const source = `${SHEET}    cells:\n      A1: { value: 1, style: header }\ndefs:\n  styles:\n    header: { font: { bold: true } }\n`;
    expect(layers(source, 'A1')).toEqual([
      {
        through: 'cell',
        key: 'style',
        node: '["spec.yxl.yaml","defs","styles","header"]',
        name: 'header',
        gives: { 'font.bold': true },
      },
    ]);
  });

  it('puts what a style extends underneath it', () => {
    const source = `${SHEET}    cells:\n      A1: { value: 1, style: header }\ndefs:\n  styles:\n    base: { font: { name: Calibri, size: 11 } }\n    header: { extends: base, font: { bold: true } }\n`;
    expect(layers(source, 'A1').map((layer) => [layer.name, layer.gives])).toEqual([
      ['base', { 'font.name': 'Calibri', 'font.size': 11 }],
      ['header', { 'font.bold': true }],
    ]);
  });

  it('keeps the base face when the child sets only the weight', () => {
    const source = `${SHEET}    cells:\n      A1: { value: 1, style: header }\ndefs:\n  styles:\n    base: { font: { name: Calibri, size: 11 } }\n    header: { extends: base, font: { bold: true } }\n`;
    expect(looks(source, 'A1')).toEqual({
      'font.name': 'Calibri',
      'font.size': 11,
      'font.bold': true,
    });
  });
});

describe('a band', () => {
  const source = `${SHEET}    columns:\n      - at: B\n        format: "#,##0"\n    rows:\n      - at: 1\n        style: { font: { bold: true } }\n    cells:\n      B1: Revenue\n      B2: 2400000\n`;

  it('reaches a cell in its span', () => {
    expect(looks(source, 'B2')).toEqual({ format: '#,##0' });
  });

  it('reaches a cell nothing wrote, which is what a band is for', () => {
    expect(sheet(source).cells.get('B9')).toBeUndefined();
    expect(looks(source, 'B9')).toEqual({ format: '#,##0' });
  });

  it('lays the row over the column, and says which is which', () => {
    expect(layers(source, 'B1').map((layer) => layer.through)).toEqual(['column', 'row']);
    expect(looks(source, 'B1')).toEqual({ format: '#,##0', 'font.bold': true });
  });

  it('reaches nothing outside its span', () => {
    expect(looks(source, 'C2')).toEqual({});
  });
});

describe('what a cell writes', () => {
  it('goes over what a band gave it', () => {
    const source = `${SHEET}    columns:\n      - at: B\n        format: "#,##0"\n    cells:\n      B2: { value: 1, format: "0.0%" }\n`;
    expect(looks(source, 'B2').format).toBe('0.0%');
    expect(layers(source, 'B2').map((layer) => layer.through)).toEqual(['column', 'cell']);
  });

  it('layers its own `format:` over the style it names', () => {
    const source = `${SHEET}    cells:\n      A1: { value: 1, style: money, format: "0.0%" }\ndefs:\n  styles:\n    money: { format: "#,##0", font: { bold: true } }\n`;
    expect(looks(source, 'A1')).toEqual({ format: '0.0%', 'font.bold': true });
  });
});

describe('a border', () => {
  it('spreads `all` over the four sides', () => {
    const source = `${SHEET}    cells:\n      A1: { value: 1, style: { border: thin } }\n`;
    expect(looks(source, 'A1')).toEqual({
      'border.left.style': 'thin',
      'border.right.style': 'thin',
      'border.top.style': 'thin',
      'border.bottom.style': 'thin',
    });
  });

  it('lets a side written after `all` replace it, as yxl reads it', () => {
    const source = `${SHEET}    cells:\n      A1: { value: 1, style: { border: { all: thin, left: thick } } }\n`;
    expect(looks(source, 'A1')['border.left.style']).toBe('thick');
    expect(looks(source, 'A1')['border.right.style']).toBe('thin');
  });

  it('keeps a colour on the edge that carries it', () => {
    const source = `${SHEET}    cells:\n      A1: { value: 1, style: { border: { top: { style: dashed, color: "FF0000" } } } }\n`;
    expect(looks(source, 'A1')).toEqual({
      'border.top.style': 'dashed',
      'border.top.color': 'FF0000',
    });
  });

  it('takes its line style from a parameter, and draws no line where that is not one', () => {
    const set = `params:\n  weight: thick\n${SHEET}    cells:\n      A1: { value: 1, style: { border: { top: "\${weight}" } } }\n`;
    expect(looks(set, 'A1')['border.top.style']).toBe('thick');

    const bad = `params:\n  weight: heavy\n${SHEET}    cells:\n      A1: { value: 1, style: { border: { top: "\${weight}" } } }\n`;
    expect(codes(bad)).toEqual([CODE.badSpelling]);
    expect(looks(bad, 'A1')['border.top.style']).toBeUndefined();
  });
});

describe('an override', () => {
  it('lays its look over everything else', () => {
    const source = `${SHEET}    cells:\n      A1: { value: 1, style: { font: { bold: true } } }\noverrides:\n  - at: Sales!A1\n    style: { fill: "FFFF00" }\n`;
    expect(layers(source, 'A1').map((layer) => layer.through)).toEqual(['cell', 'override']);
    expect(looks(source, 'A1')).toEqual({ 'font.bold': true, fill: 'FFFF00' });
  });
});

describe('a style that will not resolve', () => {
  it('is reported when nothing declares it', () => {
    expect(codes(`${SHEET}    cells:\n      A1: { value: 1, style: nosuch }\n`)).toEqual([
      CODE.unknownStyle,
    ]);
  });

  it('is reported when it extends its way back round', () => {
    const source = `${SHEET}    cells:\n      A1: { value: 1, style: a }\ndefs:\n  styles:\n    a: { extends: b, font: { bold: true } }\n    b: { extends: a, font: { italic: true } }\n`;
    expect(codes(source)).toEqual([CODE.styleCycle]);
  });

  it('is reported when a parameter fills a colour with something else', () => {
    const source = `params:\n  brand: not-a-colour\n${SHEET}    cells:\n      A1: { value: 1, style: { fill: "\${brand}" } }\n`;
    expect(codes(source)).toEqual([CODE.badColour]);
  });

  it('is reported when a parameter fills an alignment with something else', () => {
    const set = `params:\n  across: center\n${SHEET}    cells:\n      A1: { value: 1, style: { align: { horizontal: "\${across}" } } }\n`;
    expect(looks(set, 'A1')['align.horizontal']).toBe('center');

    const bad = `params:\n  across: middle\n${SHEET}    cells:\n      A1: { value: 1, style: { align: { horizontal: "\${across}" } } }\n`;
    expect(codes(bad)).toEqual([CODE.badSpelling]);
    expect(looks(bad, 'A1')['align.horizontal']).toBeUndefined();
  });
});

describe('an attribute a style says is not set', () => {
  it('takes away what a band under the cell supplies', () => {
    const source = `${SHEET}    columns:\n      - { at: A, style: { fill: "FFF2CC" } }\n    cells:\n      A1: { value: 1, style: { fill: null } }\n`;

    expect(looks(source, 'A1').fill).toBeNull();
    expect(settled(looks(source, 'A1'))).toEqual({});
  });

  it('takes away what the style it extends supplies, and keeps the rest', () => {
    const source = `${SHEET}    cells:\n      A1: { value: 1, style: { extends: header, fill: null } }\ndefs:\n  styles:\n    header: { font: { bold: true }, fill: "1F3864" }\n`;

    expect(settled(looks(source, 'A1'))).toEqual({ 'font.bold': true });
  });

  it('stays cleared until something sets one', () => {
    const source = `${SHEET}    columns:\n      - { at: A, format: "#,##0" }\n    rows:\n      - { at: 1, format: null }\n    cells:\n      A1: 1\n      A2: 2\n`;

    expect(settled(looks(source, 'A1')).format).toBeUndefined();
    expect(settled(looks(source, 'A2')).format).toBe('#,##0');
  });

  it('is beaten by a value beside it, whichever the spec wrote first', () => {
    const both = `${SHEET}    cells:\n      A1: { value: 1, style: { format: "0.00" }, format: null }\n`;
    expect(settled(looks(both, 'A1')).format).toBe('0.00');

    const edges = `${SHEET}    cells:\n      A1: { value: 1, style: { border: { all: thin, left: null } } }\n`;
    expect(settled(looks(edges, 'A1'))['border.left.style']).toBe('thin');
  });

  it('is a cell of its own where the cell takes the band format away', () => {
    const source = `${SHEET}    columns:\n      - { at: A, format: "#,##0" }\n    cells:\n      A1: { value: 1, format: null }\n`;
    expect(settled(looks(source, 'A1')).format).toBeUndefined();
  });
});
