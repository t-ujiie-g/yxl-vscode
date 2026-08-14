import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function codes(source: string): string[] {
  return load(parse(source, { file: 'spec.yxl.yaml' })).diagnostics.map((one) => one.code);
}

function inSheet(body: string): string[] {
  return codes(`sheets:\n  - name: Sales\n${body}`);
}

describe('a construct written as the wrong kind of node', () => {
  it('says which kind it wanted', () => {
    expect(codes('sheets: {}\n')).toEqual([CODE.notASequence]);
    expect(inSheet('    cells: []\n')).toEqual([CODE.notAMapping]);
    expect(inSheet('    merges: A1:B2\n')).toEqual([CODE.notASequence]);
    expect(inSheet('    columns: {}\n')).toEqual([CODE.notASequence]);
  });

  it('wants text where the schema says text', () => {
    expect(inSheet('    cells:\n      A1: { value: 1, format: 3 }\n')).toEqual([CODE.notText]);
    expect(codes('sheets:\n  - name: 2026\n')).toEqual([CODE.notText]);
  });

  it('wants a boolean where the schema says a flag', () => {
    expect(inSheet('    columns:\n      - at: B\n        hidden: 1\n')).toEqual([CODE.notABoolean]);
  });

  it('wants a number where the schema says a measurement', () => {
    expect(inSheet('    columns:\n      - at: B\n        width: wide\n')).toEqual([
      CODE.notANumber,
    ]);
  });

  it('wants a selector it can read as text', () => {
    expect(inSheet('    columns:\n      - at: [B]\n')).toEqual([CODE.notText]);
  });
});

describe('a name that is empty', () => {
  it('is refused wherever a definition declares one', () => {
    expect(codes('sheets: []\nparams:\n  "": 1\n')).toEqual([CODE.badName]);
    expect(codes('sheets: []\ndefs:\n  values:\n    "": 1\n')).toEqual([CODE.badName]);
    expect(codes('sheets: []\ndefs:\n  formulas:\n    "": "A1"\n')).toEqual([CODE.badName]);
    expect(codes('sheets: []\ndefs:\n  styles:\n    "": {}\n')).toEqual([CODE.badName]);
  });
});
