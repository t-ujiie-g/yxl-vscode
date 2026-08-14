import { parse } from '@yxl-vscode/cst';
import type { Override } from '@yxl-vscode/spec';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function loaded(body: string) {
  const source = `sheets:\n  - name: Sales\n    cells:\n      A1: x\noverrides:\n${body}`;
  return load(parse(source, { file: 'spec.yxl.yaml' }));
}

function overrides(body: string): readonly Override[] {
  return loaded(body).doc?.overrides ?? [];
}

function codes(body: string): string[] {
  return loaded(body).diagnostics.map((one) => one.code);
}

function only(body: string): Override {
  const [first] = overrides(body);
  if (first === undefined) throw new Error('no override loaded');
  return first;
}

describe('an override', () => {
  it('names the sheet and the cell it lands on', () => {
    expect(only('  - at: Sales!A1\n    value: fixed\n').at).toEqual({
      sheet: 'Sales',
      at: 'A1',
    });
  });

  it('reads a quoted sheet name', () => {
    // The whole reference is quoted, since a value that opens with `'` is a
    // YAML quoted scalar and would swallow the `!A1`.
    expect(only('  - at: "\'Q3 data\'!A1"\n    value: fixed\n').at).toEqual({
      sheet: 'Q3 data',
      at: 'A1',
    });
  });

  it('carries the reason, which nothing compiles', () => {
    const written = only(
      '  - at: Sales!A1\n    value: fixed\n    reason: 監査対応で当期のみ手修正\n',
    );
    expect(written.reason).toBe('監査対応で当期のみ手修正');
  });

  it('has no reason when none was written', () => {
    expect(only('  - at: Sales!A1\n    value: fixed\n').reason).toBeNull();
  });

  it('writes the same facets a cell does', () => {
    const written = only('  - at: Sales!E37\n    formula: "=D37"\n');
    expect(written.formula).toEqual({ kind: 'inline', body: 'D37' });
    expect(written.value).toBeNull();
  });

  it('may replace the styling alone, leaving the value where it was', () => {
    const written = only('  - at: Sales!A1\n    style: shaded\n');
    expect(written.style).toEqual({ kind: 'ref', name: 'shaded' });
    expect([written.value, written.formula, written.rich]).toEqual([null, null, null]);
  });

  it('reads several, in the order written', () => {
    const written = overrides(
      '  - at: Sales!A1\n    value: one\n  - at: Sales!A2\n    value: two\n',
    );
    expect(written.map((one) => one.value)).toEqual([
      { kind: 'literal', value: 'one' },
      { kind: 'literal', value: 'two' },
    ]);
  });

  it('is identified by its position in the sequence', () => {
    expect(only('  - at: Sales!A1\n    value: fixed\n').id).toBe('["spec.yxl.yaml","overrides",0]');
  });
});

describe('an override that will not read', () => {
  it('needs an `at`', () => {
    expect(codes('  - value: fixed\n')).toEqual([CODE.missingKey]);
  });

  it('needs the sheet named, since it sits outside every sheet', () => {
    expect(codes('  - at: A1\n    value: fixed\n')).toEqual([CODE.badAddress]);
  });

  it('takes one cell, not a range', () => {
    expect(codes('  - at: Sales!A1:B2\n    value: fixed\n')).toEqual([CODE.badAddress]);
  });

  it('must change something', () => {
    expect(codes('  - at: Sales!A1\n    reason: because\n')).toEqual([CODE.emptyCell]);
  });

  it('reports a key it does not know, naming `at` and `reason` beside the facets', () => {
    const [diagnostic] = loaded('  - at: Sales!A1\n    valeu: fixed\n').diagnostics;
    expect(diagnostic?.code).toBe(CODE.unknownKey);
    expect(diagnostic?.message).toContain('expected at, reason, value, formula');
  });

  it('keeps a `${...}` address whole, for the compiler to fill in', () => {
    expect(only('  - at: "${sheet}!A1"\n    value: fixed\n').at).toEqual({
      kind: 'template',
      text: '${sheet}!A1',
    });
  });
});
