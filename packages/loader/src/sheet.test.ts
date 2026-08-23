import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function loaded(body: string) {
  return load(parse(`sheets:\n  - ${body}`, { file: 'spec.yxl.yaml' }));
}

function sheet(body: string) {
  const first = loaded(body).doc?.sheets[0];
  if (first === undefined) throw new Error('no sheet loaded');
  return first;
}

function codes(body: string): string[] {
  return loaded(body).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('a sheet', () => {
  it('needs a name', () => {
    expect(codes('cells: {}\n')).toEqual([CODE.missingKey]);
  });

  it('keeps a name a parameter fills in', () => {
    expect(sheet('name: "${region} sales"\n').name).toEqual({
      kind: 'template',
      text: '${region} sales',
    });
  });

  it('records the order its keys were written in', () => {
    // Sheet keys apply in that order, so a `cells:` entry written after a
    // `data:` block wins (docs/spec.md §2) — nothing else in the AST says which
    // came first.
    const read = sheet('name: S\n    data: []\n    cells: {}\n');
    expect(read.keyOrder).toEqual(['name', 'data', 'cells']);
  });

  it('carries a key it does not model, in place', () => {
    const read = sheet('name: S\n    charts: []\n    filter: A1:D1\n');
    expect(read.opaque.map((o) => o.key)).toEqual(['charts', 'filter']);
    expect(read.keyOrder).toEqual(['name', 'charts', 'filter']);
  });

  it('spans an unmodeled key over its whole entry', () => {
    const source = 'sheets:\n  - name: S\n    filter: A1:D1\n';
    const opaque = load(parse(source, { file: 'f' })).doc?.sheets[0]?.opaque[0];
    expect(source.slice(opaque?.span.start, opaque?.span.end)).toBe('filter: A1:D1');
  });

  it('reads whether the sheet draws its own gridlines', () => {
    expect(sheet('name: S\n    gridlines: false\n').gridlines).toBe(false);
    expect(sheet('name: S\n').gridlines).toBeNull();
  });

  it('reads where the panes are frozen', () => {
    expect(sheet('name: S\n    freeze: B2\n').freeze).toBe('B2');
    expect(sheet('name: S\n').freeze).toBeNull();
  });

  it('refuses a freeze that is not a cell', () => {
    const { diagnostics } = load(parse('sheets:\n  - name: S\n    freeze: B2:C3\n', { file: 'f' }));
    expect(diagnostics.map((one) => one.code)).toEqual(['loader.bad-address']);
  });
});

describe('merges', () => {
  it('reads each range', () => {
    expect(sheet('name: S\n    merges: [A1:C1, D1:D4]\n').merges.map((m) => m.at)).toEqual([
      'A1:C1',
      'D1:D4',
    ]);
  });

  it('refuses a single cell, which merges nothing', () => {
    expect(codes('name: S\n    merges: [A1]\n')).toEqual([CODE.badRange]);
  });
});

describe('a filled formula range', () => {
  it('reads the range and the formula written at its top-left', () => {
    const [range] = sheet(
      'name: S\n    formulas:\n      - at: D2:D500\n        formula: "B2*C2"\n',
    ).formulas;
    expect(range?.at).toBe('D2:D500');
    expect(range?.formula).toBe('B2*C2');
  });

  it('strips a leading `=`', () => {
    const [range] = sheet(
      'name: S\n    formulas:\n      - at: D2:D3\n        formula: "=B2*C2"\n',
    ).formulas;
    expect(range?.formula).toBe('B2*C2');
  });

  it('needs both keys', () => {
    expect(codes('name: S\n    formulas:\n      - at: D2:D3\n')).toEqual([CODE.missingKey]);
    expect(codes('name: S\n    formulas:\n      - formula: "B2*C2"\n')).toEqual([CODE.missingKey]);
  });

  it('refuses a `$ref`, which would give every cell the same formula', () => {
    // A defined name does not shift per row, which is the whole point of a
    // filled range (docs/spec.md §3).
    expect(
      codes('name: S\n    formulas:\n      - at: D2:D3\n        formula: { $ref: total }\n'),
    ).toEqual([CODE.notText]);
  });
});
