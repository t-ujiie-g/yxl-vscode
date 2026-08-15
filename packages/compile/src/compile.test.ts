import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import type { A1Addr } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { cellAt, compile } from './compile';
import type { CompiledCell, CompiledSheet } from './grid';

function grid(source: string) {
  const { doc, diagnostics } = load(parse(source, { file: 'spec.yxl.yaml' }));
  if (doc === null) throw new Error(`did not load: ${diagnostics.map((one) => one.code)}`);
  return compile(doc);
}

function sheet(source: string): CompiledSheet {
  const first = grid(source).sheets[0];
  if (first === undefined) throw new Error('compiled no sheet');
  return first;
}

function at(source: string, address: string): CompiledCell | null {
  return cellAt(sheet(source), address as A1Addr);
}

function codes(source: string): string[] {
  return grid(source).diagnostics.map((one) => one.code);
}

const SALES = 'sheets:\n  - name: Sales\n';

describe('a compiled grid', () => {
  it('draws the sheets in tab order', () => {
    expect(
      grid('sheets:\n  - name: Sales\n  - name: Notes\n').sheets.map((one) => one.name),
    ).toEqual(['Sales', 'Notes']);
  });

  it('places a written cell at its address, keeping the type YAML gave it', () => {
    const drawn = sheet(`${SALES}    cells:\n      A1: Region\n      B1: 2400000\n`);
    expect(drawn.cells.get('A1')?.value).toBe('Region');
    expect(drawn.cells.get('B1')?.value).toBe(2400000);
  });

  it('says a written cell came from the node that wrote it', () => {
    const cell = at(`${SALES}    cells:\n      A1: Region\n`, 'A1');
    expect(cell?.provenance.value).toEqual({
      kind: 'literal',
      node: '["spec.yxl.yaml","sheets",0,"cells","A1"]',
    });
  });

  it('leaves a cell that is only a look holding nothing', () => {
    const cell = at(`${SALES}    cells:\n      B3: { style: shaded }\n`, 'B3');
    expect(cell?.value).toBeNull();
    expect(cell?.provenance.value.kind).toBe('literal');
  });

  it('draws the bands as geometry', () => {
    const drawn = sheet(
      `${SALES}    columns:\n      - at: B-D\n        width: 18\n    rows:\n      - at: 1\n        height: 28\n`,
    );
    expect(drawn.columns).toMatchObject([{ first: 2, last: 4, size: 18 }]);
    expect(drawn.rows).toMatchObject([{ first: 1, last: 1, size: 28 }]);
  });

  it('draws a merge as the rectangle it covers', () => {
    const drawn = sheet(`${SALES}    merges: [A1:C1]\n`);
    expect(drawn.merges[0]?.rect).toEqual({ top: 1, left: 1, bottom: 1, right: 3 });
  });
});

describe('a definition', () => {
  const spec = `sheets:\n  - name: Sales\n    cells:\n      D2: { $ref: tax_rate }\n      D3: { formula: { $ref: subtotal } }\ndefs:\n  values:\n    tax_rate: 0.085\n  formulas:\n    subtotal: "SUM(B2:B10)"\n`;

  it('gives the cell its value, and says which definition it came from', () => {
    const cell = at(spec, 'D2');
    expect(cell?.value).toBe(0.085);
    expect(cell?.provenance.value).toEqual({
      kind: 'defRef',
      node: '["spec.yxl.yaml","sheets",0,"cells","D2"]',
      def: '["spec.yxl.yaml","defs","values","tax_rate"]',
    });
  });

  it('gives the cell its formula', () => {
    expect(at(spec, 'D3')?.formula).toBe('SUM(B2:B10)');
  });

  it('is reported when nothing declares it', () => {
    expect(codes(`${SALES}    cells:\n      A1: { $ref: nosuch }\n`)).toEqual([CODE.unknownValue]);
  });
});

describe('a parameter', () => {
  it('is substituted, and recorded rather than flattened away', () => {
    const spec = `params:\n  region: APAC\n${SALES}    cells:\n      A1: "\${region} sales"\n`;
    const cell = at(spec, 'A1');
    expect(cell?.value).toBe('APAC sales');
    expect(cell?.provenance.value).toEqual({
      kind: 'param',
      node: '["spec.yxl.yaml","sheets",0,"cells","A1"]',
      template: '${region} sales',
      params: ['region'],
    });
  });

  it('keeps its type when the whole value is one placeholder', () => {
    const spec = `params:\n  rate: 0.085\n${SALES}    cells:\n      A1: "\${rate}"\n`;
    expect(at(spec, 'A1')?.value).toBe(0.085);
  });

  it('is text again once anything joins it', () => {
    const spec = `params:\n  rate: 0.085\n${SALES}    cells:\n      A1: "rate \${rate}"\n`;
    expect(at(spec, 'A1')?.value).toBe('rate 0.085');
  });

  it('fills a default that names another parameter', () => {
    const spec = `params:\n  quarter: Q3\n  title: "\${quarter} sales"\n${SALES}    cells:\n      A1: "\${title}"\n`;
    expect(at(spec, 'A1')?.value).toBe('Q3 sales');
  });

  it('fills an address, so a cell lands where the parameter says', () => {
    const spec = `params:\n  col: B\n${SALES}    cells:\n      "\${col}2": here\n`;
    expect(at(spec, 'B2')?.value).toBe('here');
  });

  it('is reported when nothing declares it, and left standing in the text', () => {
    const spec = `${SALES}    cells:\n      A1: "\${nosuch}"\n`;
    expect(codes(spec)).toEqual([CODE.unknownParam]);
    expect(at(spec, 'A1')?.value).toBe('${nosuch}');
  });

  it('reports a default that comes back round', () => {
    const spec = `params:\n  a: "\${b}"\n  b: "\${a}"\n${SALES}`;
    expect(codes(spec)).toContain(CODE.paramCycle);
  });
});

describe('a `data:` block', () => {
  const spec = `${SALES}    data:\n      - at: A2\n        values:\n          - [APAC, 2400000]\n          - [EMEA, null, 7]\n`;

  it('lays its rows down from the anchor', () => {
    expect(at(spec, 'A2')?.value).toBe('APAC');
    expect(at(spec, 'B2')?.value).toBe(2400000);
    expect(at(spec, 'A3')?.value).toBe('EMEA');
  });

  it('writes no cell where a field is null', () => {
    expect(at(spec, 'B3')).toBeNull();
    expect(at(spec, 'C3')?.value).toBe(7);
  });

  it('says which field of which block a cell came from', () => {
    expect(at(spec, 'B2')?.provenance.value).toEqual({
      kind: 'inline',
      node: '["spec.yxl.yaml","sheets",0,"data",0]',
      row: 0,
      col: 1,
    });
  });

  it('says so rather than guessing when the rows are in a file', () => {
    expect(codes(`${SALES}    data:\n      - at: A2\n        csv: sales.csv\n`)).toEqual([
      CODE.notReadYet,
    ]);
  });
});

describe('a `formulas:` range', () => {
  const spec = `${SALES}    formulas:\n      - at: D2:D500\n        formula: "B2*C2"\n`;

  it('stays a range rather than becoming five hundred cells', () => {
    const drawn = sheet(spec);
    expect(drawn.cells.size).toBe(0);
    expect(drawn.fills).toHaveLength(1);
  });

  it('answers for any cell it covers, with the offset from its anchor', () => {
    const cell = at(spec, 'D37');
    expect(cell?.formula).toBe('B2*C2');
    expect(cell?.provenance.value).toEqual({
      kind: 'formulaRange',
      node: '["spec.yxl.yaml","sheets",0,"formulas",0]',
      anchor: 'D2',
      offset: [0, 35],
    });
  });

  it('answers for nothing outside it', () => {
    expect(at(spec, 'E37')).toBeNull();
    expect(at(spec, 'D501')).toBeNull();
  });
});

describe('the order the sheet was written in', () => {
  const cells = '    cells:\n      A2: written by hand\n';
  const data = '    data:\n      - at: A2\n        values: [[from the block]]\n';

  it('lets a later key win over an earlier one', () => {
    expect(at(`${SALES}${data}${cells}`, 'A2')?.value).toBe('written by hand');
    expect(at(`${SALES}${cells}${data}`, 'A2')?.value).toBe('from the block');
  });
});

describe('an override', () => {
  const spec = `${SALES}    cells:\n      A1: { value: 1, format: "0.0%" }\n    formulas:\n      - at: E2:E9\n        formula: "C2*D2"\noverrides:\n  - at: Sales!A1\n    value: fixed\n    reason: because\n  - at: Sales!E5\n    formula: "=D5"\n`;

  it('replaces the facet it writes, and says the value is an override now', () => {
    const cell = at(spec, 'A1');
    expect(cell?.value).toBe('fixed');
    expect(cell?.provenance.value).toEqual({
      kind: 'override',
      node: '["spec.yxl.yaml","overrides",0]',
    });
  });

  it('leaves the facets it does not write where they were', () => {
    const cell = at(spec, 'A1');
    expect(cell?.format).toBe('0.0%');
    expect(cell?.provenance.format).toEqual({
      kind: 'literal',
      node: '["spec.yxl.yaml","sheets",0,"cells","A1"]',
    });
  });

  it('takes one cell out of a filled range, leaving the range whole', () => {
    expect(at(spec, 'E5')?.formula).toBe('D5');
    expect(at(spec, 'E5')?.provenance.value.kind).toBe('override');
    expect(at(spec, 'E6')?.formula).toBe('C2*D2');
    expect(sheet(spec).fills).toHaveLength(1);
  });

  it('is reported when it names a sheet that is not there', () => {
    const spec = `${SALES}    cells:\n      A1: 1\noverrides:\n  - at: Notes!A1\n    value: x\n`;
    expect(codes(spec)).toEqual([CODE.unknownSheet]);
  });
});
