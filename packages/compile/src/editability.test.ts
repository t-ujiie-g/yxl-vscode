import { filePath, nodeId } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { type Editability, editabilityOf, editabilityOfLayer } from './editability';
import { cell, layers } from './harness';

function valueClass(source: string, at: string): Editability | null {
  const drawn = cell(source, at);
  return drawn === null ? null : editabilityOf(drawn.provenance.value);
}

function lookClass(source: string, at: string): Editability[] {
  return layers(source, at).map(editabilityOfLayer);
}

const SHEET = 'sheets:\n  - name: Sales\n';

describe('how editable a value is', () => {
  it('applies straight away when one node says it', () => {
    expect(valueClass(`${SHEET}    cells:\n      A1: Region\n`, 'A1')).toBe('direct');
  });

  it('applies straight away for a field of an inline block', () => {
    const source = `${SHEET}    data:\n      - at: A2\n        values: [[APAC]]\n`;
    expect(valueClass(source, 'A2')).toBe('direct');
  });

  it('has to ask when a definition holds it', () => {
    const source = `${SHEET}    cells:\n      A1: { $ref: rate }\ndefs:\n  values:\n    rate: 0.085\n`;
    expect(valueClass(source, 'A1')).toBe('mediated');
  });

  it('has to ask when a parameter fills it', () => {
    const source = `params:\n  region: APAC\n${SHEET}    cells:\n      A1: "\${region}"\n`;
    expect(valueClass(source, 'A1')).toBe('mediated');
  });

  it('has to ask inside a filled range, where the formula moves', () => {
    const source = `${SHEET}    formulas:\n      - at: D2:D9\n        formula: "B2*C2"\n`;
    expect(valueClass(source, 'D5')).toBe('mediated');
  });

  it('applies straight away for an override, which is one node again', () => {
    const source = `${SHEET}    cells:\n      A1: 1\noverrides:\n  - at: Sales!A1\n    value: fixed\n`;
    expect(valueClass(source, 'A1')).toBe('direct');
  });

  it('applies straight away to a cell that carries only a look', () => {
    // The node is there and holds nothing; writing a value into it is one
    // change to one mapping, which is what `direct` means.
    const source = `${SHEET}    cells:\n      A1: { style: shaded }\ndefs:\n  styles:\n    shaded: { fill: "EEEEEE" }\n`;
    expect(valueClass(source, 'A1')).toBe('direct');
  });

  it('is nothing at all where no cell was written', () => {
    expect(valueClass(`${SHEET}    cells:\n      A1: 1\n`, 'B9')).toBeNull();
  });
});

describe('how editable a look is', () => {
  it('applies straight away when the cell itself wrote it', () => {
    const source = `${SHEET}    cells:\n      A1: { value: 1, style: { font: { bold: true } } }\n`;
    expect(lookClass(source, 'A1')).toEqual(['direct']);
  });

  it('has to ask when a definition holds it, however it was reached', () => {
    const source = `${SHEET}    cells:\n      A1: { value: 1, style: header }\ndefs:\n  styles:\n    header: { font: { bold: true } }\n`;
    expect(lookClass(source, 'A1')).toEqual(['mediated']);
  });

  it('has to ask when a band gives it, which is a whole column', () => {
    const source = `${SHEET}    columns:\n      - at: B\n        format: "#,##0"\n    cells:\n      B2: 1\n`;
    expect(lookClass(source, 'B2')).toEqual(['mediated']);
  });

  it('answers per layer, since one look can come from several places', () => {
    const source = `${SHEET}    columns:\n      - at: B\n        format: "#,##0"\n    cells:\n      B2: { value: 1, style: { font: { bold: true } } }\n`;
    expect(lookClass(source, 'B2')).toEqual(['mediated', 'direct']);
  });
});

describe('an origin no spec has produced yet', () => {
  it('asks about an address nothing wrote, which has two answers', () => {
    // A new `cells:` entry, or extending the `data:` rectangle beside it. The
    // projection says `null` for such an address rather than carrying a cell,
    // so the row is asserted on the origin itself.
    expect(editabilityOf({ kind: 'empty' })).toBe('mediated');
  });

  it('sends a value that lives in a file to the file', () => {
    // Nothing produces an `external` origin until the `csv:` reader lands, so
    // the row is asserted on the origin itself: the class is a fact about where
    // a value came from, not about how the projection got there.
    const file = filePath('sales.csv');
    if (file === null) throw new Error('not a path');

    const origin = { kind: 'external', node: nodeId('["x"]'), file, row: 12, col: 0 } as const;
    expect(editabilityOf(origin)).toBe('external');
  });
});
