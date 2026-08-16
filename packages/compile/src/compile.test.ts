import { filePath } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import type { DataReader } from './ctx';
import { cell as at, codes, grid, sheet } from './harness';

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

  it('says which file it could not read when nothing was given to read it with', () => {
    expect(codes(`${SALES}    data:\n      - at: A2\n        csv: sales.csv\n`)).toEqual([
      CODE.noDataReader,
    ]);
  });
});

describe('a `data:` block that names a file', () => {
  const files: Record<string, string> = {
    'sales.csv': 'APAC,2400000\nEMEA,1750000\n',
    'notes.json': '[{ "label": "one", "count": 1 }]',
  };

  const reader: DataReader = (_from, path) => {
    const source = files[path];
    if (source === undefined) return null;

    const file = filePath(path);
    return file === null ? null : { file, source };
  };

  const csv = `${SALES}    data:\n      - at: A2\n        csv: sales.csv\n`;

  it('lays the file down from the anchor', () => {
    expect(at(csv, 'A2', reader)?.value).toBe('APAC');
    expect(at(csv, 'B3', reader)?.value).toBe(1750000);
  });

  it('says which row and field of which file a cell came from', () => {
    expect(at(csv, 'B3', reader)?.provenance.value).toEqual({
      kind: 'external',
      node: '["spec.yxl.yaml","sheets",0,"data",0]',
      file: 'sales.csv',
      row: 1,
      col: 1,
    });
  });

  it('takes the fields a JSON block names, in that order', () => {
    const json = `${SALES}    data:\n      - at: A1\n        json: notes.json\n        columns: [count, label]\n`;
    expect(at(json, 'A1', reader)?.value).toBe(1);
    expect(at(json, 'B1', reader)?.value).toBe('one');
  });

  it('says which file it could not read', () => {
    const missing = `${SALES}    data:\n      - at: A2\n        csv: gone.csv\n`;
    expect(codes(missing, reader)).toEqual([CODE.unreadableData]);
  });

  it('names the file when what is in it will not read', () => {
    files['broken.csv'] = '"unterminated';
    const broken = `${SALES}    data:\n      - at: A2\n        csv: broken.csv\n`;
    const [diagnostic] = grid(broken, reader).diagnostics;
    expect(diagnostic?.code).toBe(CODE.badTable);
    expect(diagnostic?.message).toContain('broken.csv');
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

describe('a typed cell', () => {
  it('becomes the number Excel keeps, under the format that reads it back', () => {
    const cell = at(`${SALES}    cells:\n      A1: { value: "2023-03-15", type: date }\n`, 'A1');
    expect(cell?.value).toBe(45000);
    expect(cell?.format).toBe('yyyy-mm-dd');
  });

  it('takes the date-time format when the text carried a time', () => {
    const spec = `${SALES}    cells:\n      A1: { value: "2023-03-15 06:00:00", type: date }\n`;
    expect(at(spec, 'A1')?.format).toBe('yyyy-mm-dd hh:mm:ss');
  });

  it('counts an elapsed time as a fraction of a day', () => {
    const cell = at(`${SALES}    cells:\n      A1: { value: "36:00:00", type: duration }\n`, 'A1');
    expect(cell?.value).toBe(1.5);
    expect(cell?.format).toBe('[h]:mm:ss');
  });

  it('keeps the format the spec wrote, which is a request', () => {
    const spec = `${SALES}    cells:\n      A1: { value: "2023-03-15", type: date, format: "dd/mm/yyyy" }\n`;
    expect(at(spec, 'A1')?.format).toBe('dd/mm/yyyy');
  });

  it('numbers a date from the epoch the workbook chose', () => {
    const spec = `date1904: true\n${SALES}    cells:\n      A1: { value: "2023-03-15", type: date }\n`;
    expect(at(spec, 'A1')?.value).toBe(43538);
  });

  it('is reported, and left as written, when the value is not one', () => {
    const spec = `${SALES}    cells:\n      A1: { value: "15/03/2023", type: date }\n`;
    expect(codes(spec)).toEqual([CODE.badDate]);
    expect(at(spec, 'A1')?.value).toBe('15/03/2023');
  });
});

describe('a cell written in runs', () => {
  const RICH = `${SALES}    cells:\n      A1:\n        rich:\n          - "Figures are "\n          - { text: unaudited, font: { italic: true, color: "C00000" } }\n          - " as of Q3."\n`;

  it('keeps the runs apart, which is what a rich cell is for', () => {
    expect(at(RICH, 'A1')?.rich?.map((run) => run.text)).toEqual([
      'Figures are ',
      'unaudited',
      ' as of Q3.',
    ]);
  });

  it('gives each run the look that run alone was given', () => {
    expect(at(RICH, 'A1')?.rich?.map((run) => run.look)).toEqual([
      {},
      { 'font.italic': true, 'font.color': 'C00000' },
      {},
    ]);
  });

  it('substitutes a parameter inside a run, as it does in a value', () => {
    const spec = `params:\n  who: Finance\n${SALES}    cells:\n      A1:\n        rich:\n          - "From \${who}"\n`;
    expect(at(spec, 'A1')?.rich?.[0]?.text).toBe('From Finance');
  });

  it('holds no value, because the runs are what it says', () => {
    expect(at(RICH, 'A1')?.value).toBeNull();
  });
});

describe('a cell that is only a number format', () => {
  it('holds nothing, and says its value came from nowhere', () => {
    // The one shape that produces an `empty` origin: the node exists and no key
    // in it says what the cell holds.
    const cell = at(`${SALES}    cells:\n      A1: { format: "0.0%" }\n`, 'A1');
    expect(cell?.value).toBeNull();
    expect(cell?.provenance.value).toMatchObject({ kind: 'empty' });
    expect(cell?.provenance.value.kind === 'empty' && cell.provenance.value.node).not.toBeNull();
    expect(cell?.format).toBe('0.0%');
  });
});

describe('what a parameter can leave unreadable', () => {
  // Each of these reads at load time and stops reading once a placeholder is
  // filled in — which is why the check exists here as well as in the loader.
  it('an address', () => {
    const spec = `params:\n  col: "!"\n${SALES}    cells:\n      "\${col}1": x\n`;
    expect(codes(spec)).toEqual([CODE.badAddress]);
  });

  it('a range', () => {
    const spec = `params:\n  span: nonsense\n${SALES}    formulas:\n      - at: "\${span}"\n        formula: "A1"\n`;
    expect(codes(spec)).toEqual([CODE.badRange]);
  });

  it('a column, and a row', () => {
    const columns = `params:\n  col: "1"\n${SALES}    columns:\n      - at: "\${col}"\n        width: 2\n`;
    expect(codes(columns)).toEqual([CODE.badColumn]);

    const rows = `params:\n  row: B\n${SALES}    rows:\n      - at: "\${row}"\n        height: 2\n`;
    expect(codes(rows)).toEqual([CODE.badRow]);
  });

  it('a path', () => {
    const spec = `params:\n  file: ""\n${SALES}    data:\n      - at: A1\n        csv: "\${file}"\n`;
    expect(codes(spec)).toEqual([CODE.badPath]);
  });

  it('and a `${` that never closes is reported where it stands', () => {
    expect(codes(`${SALES}    cells:\n      A1: "\${unclosed"\n`)).toEqual([
      CODE.unclosedPlaceholder,
    ]);
  });
});

describe('a formula definition', () => {
  it('is reported when nothing declares it', () => {
    expect(codes(`${SALES}    cells:\n      A1: { formula: { $ref: nosuch } }\n`)).toEqual([
      CODE.unknownFormula,
    ]);
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
