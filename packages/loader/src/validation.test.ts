import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function loaded(body: string) {
  return load(parse(`sheets:\n  - name: S\n    validations:\n${body}`, { file: 'spec.yxl.yaml' }));
}

function first(body: string) {
  const one = loaded(body).doc?.sheets[0]?.validations[0];
  if (one === undefined) throw new Error('no validation loaded');
  return one;
}

function codes(body: string): string[] {
  return loaded(body).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('a validation', () => {
  it('reads a list of choices, and the cells a list comes from', () => {
    expect(first('      - at: B2:B9\n        list: [Draft, Sent, Paid]\n').test).toEqual({
      kind: 'list',
      choices: ['Draft', 'Sent', 'Paid'],
    });
    expect(first('      - at: B2:B9\n        list: { from: "Statuses!A1:A3" }\n').test).toEqual({
      kind: 'listFrom',
      from: 'Statuses!A1:A3',
    });
  });

  it('reads each compared kind in the comparison a conditional rule is spelled in', () => {
    expect(first('      - at: D2:D9\n        whole: { between: [1, 1000] }\n').test).toEqual({
      kind: 'whole',
      compares: { kind: 'between', low: 1, high: 1000 },
    });
    expect(first('      - at: G2:G9\n        date: { at_least: "2026-01-01" }\n').test).toEqual({
      kind: 'date',
      compares: { kind: 'at_least', bound: '2026-01-01' },
    });
  });

  it('lets a blank through unless the spec says not to', () => {
    expect(first('      - at: B2:B9\n        list: [a]\n').allowBlank).toBe(true);
    expect(
      first('      - at: B2:B9\n        list: [a]\n        allow_blank: false\n').allowBlank,
    ).toBe(false);
  });

  it('reads what it says when the cell is selected and when a value is refused', () => {
    const said =
      '      - at: B2:B9\n        list: [a]\n        prompt: { title: Status, body: Pick one. }\n        error: { title: "Not a status", body: "Choose from the list.", style: warning }\n';
    expect(first(said).prompt).toEqual({ title: 'Status', body: 'Pick one.' });
    expect(first(said).error).toEqual({
      title: 'Not a status',
      body: 'Choose from the list.',
      style: 'warning',
    });
  });

  it('refuses the value by default, as Excel does', () => {
    const said = '      - at: B2:B9\n        list: [a]\n        error: { title: No }\n';
    expect(first(said).error).toEqual({ title: 'No', body: null, style: 'stop' });
  });

  it('keeps a refusal a parameter fills in', () => {
    const said = '      - at: B2:B9\n        list: [a]\n        error: { style: "${how}" }\n';
    expect(first(said).error?.style).toEqual({ kind: 'template', text: '${how}' });
  });

  it('needs a range, one thing to ask, and no key of its own invention', () => {
    expect(codes('      - list: [a]\n')).toEqual([CODE.missingKey]);
    expect(codes('      - at: B2:B9\n')).toEqual([CODE.missingKey]);
    expect(codes('      - at: B2:B9\n        list: [a]\n        whole: { at_least: 1 }\n')).toEqual(
      [CODE.conflictingKeys],
    );
    expect(codes('      - at: B2:B9\n        whole: { under: 3 }\n')).toEqual([
      CODE.unknownSpelling,
    ]);
    expect(codes('      - at: B2:B9\n        list: [a]\n        colour: red\n')).toEqual([
      CODE.unknownKey,
    ]);
  });
});
