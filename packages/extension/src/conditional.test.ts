import { type CompiledRule, compile, resolve, settled } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import { type A1Addr, parseA1Addr } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { applied, decidable } from './conditional';

/** The rules of a spec, compiled, which is what the drawing is handed. */
function rulesOf(body: string): readonly CompiledRule[] {
  const source = `defs:\n  styles:\n    a: { font: { bold: true } }\n    b: { font: { italic: true } }\nsheets:\n  - name: S\n    conditional:\n${body}`;
  const { doc } = load(parse(source, { file: 'spec.yxl.yaml' }));
  if (doc === null) throw new Error('did not load');

  return compile(doc).sheets[0]?.conditional ?? [];
}

const at = (address: string): A1Addr => parseA1Addr(address) ?? ('A1' as A1Addr);

/** What the rules make a cell wear, as the properties they set. */
function wears(rules: readonly CompiledRule[], address: string, value: unknown): string[] {
  const layers = applied(rules, {
    at: at(address),
    value: value as never,
    computed: null,
  });

  return Object.keys(settled(resolve(layers)));
}

describe('the rules a cell is drawn under', () => {
  const RULES = rulesOf(
    '      - at: A2:A9\n        cell: { equals: done }\n        style: a\n      - at: B2:B9\n        cell: { at_least: 1000 }\n        style: b\n',
  );

  it('applies the rule whose range covers the cell and whose test it passes', () => {
    expect(wears(RULES, 'A2', 'done')).toEqual(['font.bold']);
    expect(wears(RULES, 'B3', 1200)).toEqual(['font.italic']);
  });

  it('applies nothing where the test fails, or where the range does not reach', () => {
    expect(wears(RULES, 'A2', 'other')).toEqual([]);
    expect(wears(RULES, 'A1', 'done')).toEqual([]);
    expect(wears(RULES, 'C2', 'done')).toEqual([]);
  });

  it('compares numbers as numbers and text as Excel does, without case', () => {
    expect(wears(RULES, 'A2', 'DONE')).toEqual(['font.bold']);
    expect(wears(RULES, 'B2', 999)).toEqual([]);
    expect(wears(RULES, 'B2', 1000)).toEqual(['font.italic']);
  });

  it('lays a later rule over an earlier one, which is Excel priority order', () => {
    const both = rulesOf(
      '      - at: A1:A9\n        cell: { equals: x }\n        style: a\n      - at: A1:A9\n        text: { contains: x }\n        style: b\n',
    );

    expect(wears(both, 'A1', 'x').sort()).toEqual(['font.bold', 'font.italic']);
  });

  it('stops at a rule that says to, and lets the ones before it stand', () => {
    const stops = rulesOf(
      '      - at: A1:A9\n        cell: { equals: x }\n        style: a\n        stop_if_true: true\n      - at: A1:A9\n        text: { contains: x }\n        style: b\n',
    );

    expect(wears(stops, 'A1', 'x')).toEqual(['font.bold']);
  });

  it('takes the computed value where there is one, which is what the reader sees', () => {
    const layers = applied(RULES, {
      at: at('B2'),
      value: null,
      computed: { kind: 'value', value: 2000 },
    });

    expect(Object.keys(settled(resolve(layers)))).toEqual(['font.italic']);
  });

  it('decides a `cell` and a `text` rule, and says it cannot decide the others', () => {
    const kinds = rulesOf(
      '      - at: A1:A9\n        cell: { equals: x }\n        style: a\n      - at: A1:A9\n        text: { contains: x }\n        style: b\n      - at: A1:A9\n        formula: "A1>0"\n        style: a\n      - at: A1:A9\n        top: 3\n        style: b\n',
    );

    expect(kinds.map(decidable)).toEqual([true, true, false, false]);
  });

  it('applies nothing for a rule it cannot decide, and does not let it stop the run', () => {
    const kinds = rulesOf(
      '      - at: A1:A9\n        formula: "A1>0"\n        style: a\n        stop_if_true: true\n      - at: A1:A9\n        cell: { equals: x }\n        style: b\n',
    );

    expect(wears(kinds, 'A1', 'x')).toEqual(['font.italic']);
  });
});
