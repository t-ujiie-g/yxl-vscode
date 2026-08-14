import { parse } from '@yxl-vscode/cst';
import type { Cell } from '@yxl-vscode/spec';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function cells(body: string): readonly Cell[] {
  const source = `sheets:\n  - name: Sales\n    cells:\n${body}`;
  return load(parse(source, { file: 'spec.yxl.yaml' })).doc?.sheets[0]?.cells ?? [];
}

function codes(body: string): string[] {
  const source = `sheets:\n  - name: Sales\n    cells:\n${body}`;
  return load(parse(source, { file: 'spec.yxl.yaml' })).diagnostics.map((d) => d.code);
}

function only(body: string): Cell {
  const [first] = cells(body);
  if (first === undefined) throw new Error('no cell loaded');
  return first;
}

describe('a cell written as a value', () => {
  it('keeps the type YAML gave it', () => {
    expect(only('      A1: Region\n').value).toEqual({ kind: 'literal', value: 'Region' });
    expect(only('      A1: 2400000\n').value).toEqual({ kind: 'literal', value: 2400000 });
    expect(only('      A1: true\n').value).toEqual({ kind: 'literal', value: true });
  });

  it('keeps a quoted number as the text it was written as', () => {
    expect(only('      A1: "007"\n').value).toEqual({ kind: 'literal', value: '007' });
  });

  it('sets nothing else', () => {
    const cell = only('      A1: Region\n');
    expect([cell.formula, cell.rich, cell.type, cell.format, cell.style]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('refuses a key written with nothing after it', () => {
    expect(codes('      A1:\n')).toEqual([CODE.notAValue]);
  });
});

describe('a cell key', () => {
  it('is the address it names', () => {
    expect(only('      AA10: x\n').at).toBe('AA10');
  });

  it('is refused when it is not one', () => {
    expect(codes('      A0: x\n')).toEqual([CODE.badAddress]);
    expect(codes('      A1:B2: x\n')).toEqual([CODE.badAddress]);
  });

  it('is kept as a placeholder when a parameter fills it in', () => {
    expect(only('      "${col}1": x\n').at).toEqual({ kind: 'template', text: '${col}1' });
  });

  it('is read as text when the `$` opens no placeholder', () => {
    // `$$` is a literal `$` (docs/spec.md §7), so this is an address that is
    // simply not one, not a placeholder waiting to be filled.
    expect(codes('      "$$A1": x\n')).toEqual([CODE.badAddress]);
  });

  it('is read as text when a `${` never closes', () => {
    expect(codes('      "${col1": x\n')).toEqual([CODE.badAddress]);
  });
});

describe('a cell written as a mapping', () => {
  it('reads a value with a format', () => {
    const cell = only('      A2: { value: 0.085, format: "0.0%" }\n');
    expect(cell.value).toEqual({ kind: 'literal', value: 0.085 });
    expect(cell.format).toBe('0.0%');
  });

  it('reads a formula and the cached value beside it', () => {
    const cell = only('      B2: { formula: "SUM(B1:B1)", value: 2400000 }\n');
    expect(cell.formula).toEqual({ kind: 'inline', body: 'SUM(B1:B1)' });
    expect(cell.value).toEqual({ kind: 'literal', value: 2400000 });
  });

  it('strips a leading `=` from a formula, as Excel stores it', () => {
    expect(only('      B2: { formula: "=SUM(A1:A2)" }\n').formula).toEqual({
      kind: 'inline',
      body: 'SUM(A1:A2)',
    });
  });

  it('reads a type', () => {
    expect(only('      C2: { value: "2026-07-23", type: date }\n').type).toBe('date');
  });

  it('refuses a type outside the vocabulary', () => {
    expect(codes('      C2: { value: 1, type: money }\n')).toEqual([CODE.unknownSpelling]);
  });

  it('reads a cell that is a look and nothing else', () => {
    const cell = only('      B3: { style: shaded }\n');
    expect(cell.style).toEqual({ kind: 'ref', name: 'shaded' });
    expect(cell.value).toBeNull();
  });

  it('refuses a cell that says nothing', () => {
    expect(codes('      B3: {}\n')).toEqual([CODE.emptyCell]);
  });

  it('reports a key it does not know, naming the ones it does', () => {
    const [diagnostic] = load(
      parse('sheets:\n  - name: S\n    cells:\n      A1: { valeu: 1 }\n', { file: 'f' }),
    ).diagnostics;
    expect(diagnostic?.code).toBe(CODE.unknownKey);
    expect(diagnostic?.message).toContain('expected value, formula, rich, type, format, style');
  });
});

describe('a `$ref` cell', () => {
  it('names a value definition, written as the whole cell', () => {
    expect(only('      D2: { $ref: tax_rate }\n').value).toEqual({ kind: 'ref', name: 'tax_rate' });
  });

  it('names one under `value`, where a format may sit beside it', () => {
    const cell = only('      D2: { value: { $ref: tax_rate }, format: "0.0%" }\n');
    expect(cell.value).toEqual({ kind: 'ref', name: 'tax_rate' });
    expect(cell.format).toBe('0.0%');
  });

  it('names a formula definition under `formula`', () => {
    expect(only('      D2: { formula: { $ref: subtotal } }\n').formula).toEqual({
      kind: 'ref',
      name: 'subtotal',
    });
  });

  it('is an ordinary mapping when another key sits beside it', () => {
    // yxl reads `$ref` as a reference only when it is the whole mapping, and
    // then finds a key it does not know — so this is an unknown key, not a
    // reference with something extra.
    expect(codes('      D2: { $ref: tax_rate, format: "0.0%" }\n')).toEqual([CODE.unknownKey]);
  });
});

describe('rich text', () => {
  it('reads plain and fonted runs in order', () => {
    const cell = only(
      '      A3:\n        rich:\n          - "Plain then "\n          - { text: bold, font: { bold: true } }\n',
    );
    expect(cell.rich?.map((run) => run.text)).toEqual(['Plain then ', 'bold']);
    expect(cell.rich?.[0]?.font).toBeNull();
    expect(cell.rich?.[1]?.font?.bold).toBe(true);
  });

  it('needs a text in a run that is a mapping', () => {
    expect(codes('      A3: { rich: [{ font: { bold: true } }] }\n')).toEqual([CODE.missingKey]);
  });

  it('cannot hold a value as well', () => {
    expect(codes('      A3: { rich: ["a"], value: 1 }\n')).toEqual([CODE.conflictingKeys]);
  });

  it('cannot be given a type, which has nothing to apply itself to', () => {
    expect(codes('      A3: { rich: ["a"], type: text }\n')).toEqual([CODE.conflictingKeys]);
  });
});

describe('a type that has nothing to apply itself to', () => {
  it('is reported beside a formula', () => {
    expect(codes('      A1: { formula: "1+1", type: number }\n')).toEqual([CODE.conflictingKeys]);
  });

  it('is reported beside a `$ref`', () => {
    expect(codes('      A1: { value: { $ref: rate }, type: number }\n')).toEqual([
      CODE.conflictingKeys,
    ]);
  });
});
