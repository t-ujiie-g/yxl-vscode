import { type CompiledSheet, compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import type { SpecDoc } from '@yxl-vscode/spec';
import { type A1Addr, filePath } from '@yxl-vscode/units';
import type { Source } from '@yxl-vscode/webview/protocol';
import { describe, expect, it } from 'vitest';
import { inspect, nodesOf, nodeUnder } from './inspect';

const FILE = 'spec.yxl.yaml';

function read(source: string): { doc: SpecDoc; sheet: CompiledSheet } {
  const { doc } = load(parse(source, { file: FILE }));
  if (doc === null) throw new Error('did not load');

  const sheet = compile(doc).sheets[0];
  if (sheet === undefined) throw new Error('compiled no sheet');
  return { doc, sheet };
}

function sources(source: string, at: string): Source[] {
  const { doc, sheet } = read(source);
  return inspect(nodesOf(doc), sheet, at as A1Addr, FILE);
}

function saying(source: string, at: string, facet: string): string {
  return sources(source, at).find((one) => one.facet === facet)?.says ?? '';
}

const SHEET = 'sheets:\n  - name: Sales\n';

describe('what the inspector says about a value', () => {
  it('names the cell that wrote it', () => {
    expect(saying(`${SHEET}    cells:\n      A1: Region\n`, 'A1', 'value')).toBe('written at `A1`');
  });

  it('names the definition behind a reference', () => {
    const spec = `${SHEET}    cells:\n      A1: { $ref: rate }\ndefs:\n  values:\n    rate: 0.085\n`;
    expect(saying(spec, 'A1', 'value')).toBe('the definition `defs.values.rate`');
  });

  it('names the parameter and the text it filled', () => {
    const spec = `params:\n  region: APAC\n${SHEET}    cells:\n      A1: "\${region} sales"\n`;
    expect(saying(spec, 'A1', 'value')).toBe('the parameter `region`, in `${region} sales`');
  });

  it('names the row and field of a data block', () => {
    const spec = `${SHEET}    data:\n      - at: A1\n        values:\n          - [one, two]\n`;
    expect(saying(spec, 'B1', 'value')).toBe('row 1, field 2 of the data block at `A1`');
  });

  it('names the range a filled cell reads from', () => {
    const spec = `${SHEET}    formulas:\n      - at: C2:C3\n        formula: "B2*0.05"\n`;
    expect(saying(spec, 'C3', 'value')).toBe('filled from `C2` by the range `C2:C3`');
  });

  it('says an override is one', () => {
    const spec = `${SHEET}    cells:\n      A1: 1\noverrides:\n  - at: Sales!A1\n    value: fixed\n`;
    expect(saying(spec, 'A1', 'value')).toBe('an override');
  });
});

describe('what the inspector says about a look', () => {
  it('answers property by property, naming what supplied each', () => {
    const spec = `${SHEET}    columns:\n      - at: A\n        format: "#,##0"\n    cells:\n      A1: { value: 1, style: header }\ndefs:\n  styles:\n    header: { font: { bold: true } }\n`;
    const said = sources(spec, 'A1').map((one) => [one.facet, one.says]);

    expect(said).toContainEqual(['format', 'column `A`']);
    expect(said).toContainEqual(['font.bold', 'the style `header`']);
  });

  it('answers a property once, with the layer the cell is wearing', () => {
    // Two styles reaching the same cell both extend `base`, so `base` supplies
    // `font.size` twice. Two lines would be two claims about one fact, with
    // nothing saying which of them the reader is looking at.
    const spec = `${SHEET}    columns:\n      - at: A\n        style: money\n    cells:\n      A1: { value: 1, style: total }\ndefs:\n  styles:\n    base: { font: { size: 11 } }\n    money: { extends: base, format: "#,##0" }\n    total: { extends: base, font: { bold: true } }\n`;
    const said = sources(spec, 'A1').map((one) => one.facet);

    expect(said.filter((facet) => facet === 'font.size')).toEqual(['font.size']);
    expect(said).toContain('font.bold');
  });

  it('lets the cell keep the answer when a style would give the same facet', () => {
    // The value's own provenance is the authority on where a value came from;
    // a style reaching the cell says nothing about that.
    const spec = `${SHEET}    cells:\n      A1: { value: 1, format: "0.0%", style: money }\ndefs:\n  styles:\n    money: { format: "#,##0" }\n`;
    const said = sources(spec, 'A1').filter((one) => one.facet === 'format');

    expect(said.map((one) => one.says)).toEqual(['written at `A1`']);
  });

  it('names the base of an `extends:` chain for what the base gave', () => {
    const spec = `${SHEET}    cells:\n      A1: { value: 1, style: header }\ndefs:\n  styles:\n    base: { font: { size: 11 } }\n    header: { extends: base, font: { bold: true } }\n`;
    expect(saying(spec, 'A1', 'font.size')).toBe('the style `base`');
    expect(saying(spec, 'A1', 'font.bold')).toBe('the style `header`');
  });
});

describe('what the inspector says about a file beside the spec', () => {
  it('names it the way the spec named it, not the way this machine spells it', () => {
    // The absolute path is this machine's business, and it is the same file
    // spelled differently on every machine on the team.
    const spec = `${SHEET}    data:\n      - at: A1\n        csv: sales.csv\n`;
    const beside = (_from: string, path: string) => {
      const file = filePath(`/specs/${path}`);
      return file === null ? null : { file, source: 'APAC,1\n' };
    };

    const { doc } = load(parse(spec, { file: '/specs/report.yxl.yaml' }), beside);
    if (doc === null) throw new Error('did not load');

    const sheet = compile(doc, { read: beside }).sheets[0];
    if (sheet === undefined) throw new Error('compiled no sheet');

    const said = inspect(nodesOf(doc), sheet, 'A1' as A1Addr, '/specs/report.yxl.yaml');
    expect(said[0]?.says).toBe('row 1, field 1 of `sales.csv`');
  });
});

describe('the node under a cursor', () => {
  const spec = `${SHEET}    cells:\n      A1: Region\n      B1: 2\n`;

  it('is the innermost one whose span holds the offset', () => {
    const { doc } = read(spec);
    const nodes = nodesOf(doc);
    const found = nodeUnder(nodes, FILE, spec.indexOf('A1: Region') + 2);

    expect(nodes.get(found ?? '')?.what).toBe('`A1`');
  });

  it('is nothing where no node reaches', () => {
    const { doc } = read(spec);
    expect(nodeUnder(nodesOf(doc), 'another.yaml', 0)).toBeNull();
  });
});

describe('where the inspector would take you', () => {
  it('is the definition, not the cell that references it', () => {
    const spec = `${SHEET}    cells:\n      A1: { $ref: rate }\ndefs:\n  values:\n    rate: 0.085\n`;
    const source = sources(spec, 'A1').find((one) => one.facet === 'value');

    expect(spec.slice(source?.start, source?.end)).toBe('rate: 0.085');
    expect(source?.file).toBe(FILE);
  });

  it('is nowhere for a cell that holds nothing', () => {
    const spec = `${SHEET}    cells:\n      A1: { format: "0.0%" }\n`;
    const source = sources(spec, 'A1').find((one) => one.facet === 'value');

    expect(source?.says).toContain('nothing');
    expect(source?.file).toBe('');
  });

  it('is nothing at all where no cell was written', () => {
    expect(sources(`${SHEET}    cells:\n      A1: 1\n`, 'B9')).toEqual([]);
  });
});
