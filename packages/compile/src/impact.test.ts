import { nodeId } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { grid } from './harness';
import { reaches } from './impact';

function reached(source: string, node: string): string[] {
  return reaches(grid(source), nodeId(node)).map((one) => `${one.sheet}!${one.at}`);
}

const SHEET = 'sheets:\n  - name: Sales\n';

describe('what a definition reaches', () => {
  const source = `${SHEET}    cells:\n      A1: { $ref: rate }\n      A2: { $ref: rate }\n      A3: 1\ndefs:\n  values:\n    rate: 0.085\n`;

  it('is every cell that references it', () => {
    expect(reached(source, '["spec.yxl.yaml","defs","values","rate"]')).toEqual([
      'Sales!A1',
      'Sales!A2',
    ]);
  });

  it('is not the cells that do not', () => {
    expect(reached(source, '["spec.yxl.yaml","defs","values","rate"]')).not.toContain('Sales!A3');
  });

  it('counts a style definition through whatever applies it', () => {
    const styled = `${SHEET}    columns:\n      - at: A\n        style: header\n    cells:\n      A1: 1\n      B1: 2\ndefs:\n  styles:\n    header: { font: { bold: true } }\n`;
    expect(reached(styled, '["spec.yxl.yaml","defs","styles","header"]')).toEqual(['Sales!A1']);
  });

  it('counts the base of an `extends:` chain, not just the style named', () => {
    const styled = `${SHEET}    cells:\n      A1: { value: 1, style: header }\ndefs:\n  styles:\n    base: { font: { size: 11 } }\n    header: { extends: base, font: { bold: true } }\n`;
    expect(reached(styled, '["spec.yxl.yaml","defs","styles","base"]')).toEqual(['Sales!A1']);
  });
});

describe('what a band reaches', () => {
  const source = `${SHEET}    columns:\n      - at: B\n        format: "#,##0"\n    cells:\n      B1: 1\n      B2: 2\n      C1: 3\n`;

  it('is the cells the projection holds in its span', () => {
    expect(reached(source, '["spec.yxl.yaml","sheets",0,"columns",0]')).toEqual([
      'Sales!B1',
      'Sales!B2',
    ]);
  });

  it('is not what the projection holds outside it', () => {
    expect(reached(source, '["spec.yxl.yaml","sheets",0,"columns",0]')).not.toContain('Sales!C1');
  });
});

describe('what a `data:` block reaches', () => {
  it('is every field it laid down', () => {
    const source = `${SHEET}    data:\n      - at: A1\n        values:\n          - [one, two]\n`;
    expect(reached(source, '["spec.yxl.yaml","sheets",0,"data",0]')).toEqual([
      'Sales!A1',
      'Sales!B1',
    ]);
  });
});

describe('what a `formulas:` range reaches', () => {
  it('names every cell it covers, which is the point of asking', () => {
    // The range is held as a range rather than as cells (ADR-019), so a reach
    // that only counted cells would say a range reaches nothing — of every
    // construct, the one whose reach a reader most wants to see.
    const source = `${SHEET}    cells:\n      A1: 1\n      A2: 2\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;
    expect(reached(source, '["spec.yxl.yaml","sheets",0,"formulas",0]')).toEqual([
      'Sales!B1',
      'Sales!B2',
    ]);
  });

  it('stops where the sheet does, not where the range was written to', () => {
    // `B1:B1048576` is a legal thing to write; a count a reader can act on is
    // not the height of a sheet.
    const source = `${SHEET}    cells:\n      A1: 1\n    formulas:\n      - at: B1:B1048576\n        formula: "A1"\n`;
    expect(reached(source, '["spec.yxl.yaml","sheets",0,"formulas",0]')).toEqual(['Sales!B1']);
  });

  it('leaves out a cell the spec wrote over the range', () => {
    const source = `${SHEET}    cells:\n      A1: 1\n      A2: 2\n      B2: written\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;
    expect(reached(source, '["spec.yxl.yaml","sheets",0,"formulas",0]')).toEqual(['Sales!B1']);
  });
});

describe('what nothing reaches', () => {
  it('is nothing', () => {
    const source = `${SHEET}    cells:\n      A1: 1\n`;
    expect(reached(source, '["spec.yxl.yaml","defs","values","gone"]')).toEqual([]);
  });
});

describe('across sheets', () => {
  it('names the sheet each cell is on', () => {
    const source = `sheets:\n  - name: Sales\n    cells:\n      A1: { $ref: rate }\n  - name: Notes\n    cells:\n      B2: { $ref: rate }\ndefs:\n  values:\n    rate: 1\n`;
    expect(reached(source, '["spec.yxl.yaml","defs","values","rate"]')).toEqual([
      'Sales!A1',
      'Notes!B2',
    ]);
  });
});
