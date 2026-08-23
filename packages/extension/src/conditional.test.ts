import { type CompiledRule, compile, resolve, settled } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import { type A1Addr, parseA1Addr } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { applied, barAt, iconAt, overRanges, spreads } from './conditional';

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

  it('lets an icon rule stand beside a look, since it dresses nothing itself', () => {
    const kinds = rulesOf(
      '      - at: A1:A9\n        icon_set: 3Arrows\n      - at: A1:A9\n        cell: { equals: x }\n        style: b\n',
    );

    expect(wears(kinds, 'A1', 'x')).toEqual(['font.italic']);
  });

  it('takes a `formula` rule from what the engine answered for that cell', () => {
    const rules = rulesOf('      - at: A1:A9\n        formula: "A1>0"\n        style: a\n');
    const said = (value: boolean) =>
      applied(rules, {
        at: at('A1'),
        value: 1,
        computed: null,
        conditions: () => ({ kind: 'value', value }),
      });

    expect(Object.keys(settled(resolve(said(true))))).toEqual(['font.bold']);
    expect(Object.keys(settled(resolve(said(false))))).toEqual([]);
  });

  it('applies nothing for a `formula` rule the engine could not answer', () => {
    const rules = rulesOf(
      '      - at: A1:A9\n        formula: "A1>0"\n        style: a\n        stop_if_true: true\n      - at: A1:A9\n        cell: { equals: x }\n        style: b\n',
    );
    const layers = applied(rules, { at: at('A1'), value: 'x', computed: null });

    expect(Object.keys(settled(resolve(layers)))).toEqual(['font.italic']);
  });
});

describe('the rules that need the whole range to decide', () => {
  /** What the rules make a cell wear, the range's values given as the sheet holds them. */
  function over(rules: readonly CompiledRule[], values: Record<string, unknown>, address: string) {
    const written = Object.keys(values).map(at);
    const held = (one: A1Addr) => (values[String(one)] ?? null) as never;
    const layers = applied(
      rules,
      { at: at(address), value: held(at(address)), computed: null },
      overRanges(rules, written, held),
    );

    return Object.keys(settled(resolve(layers)));
  }

  it('marks the top few by value, and takes every cell that ties for the last place', () => {
    const rules = rulesOf('      - at: A1:A9\n        top: 2\n        style: a\n');
    const values = { A1: 10, A2: 30, A3: 20, A4: 20 };

    expect(over(rules, values, 'A2')).toEqual(['font.bold']);
    expect(over(rules, values, 'A3')).toEqual(['font.bold']);
    expect(over(rules, values, 'A4')).toEqual(['font.bold']);
    expect(over(rules, values, 'A1')).toEqual([]);
  });

  it('marks the bottom few the other way round', () => {
    const rules = rulesOf('      - at: A1:A9\n        bottom: 1\n        style: a\n');

    expect(over(rules, { A1: 10, A2: 30, A3: 20 }, 'A1')).toEqual(['font.bold']);
    expect(over(rules, { A1: 10, A2: 30, A3: 20 }, 'A2')).toEqual([]);
  });

  it('takes a percentage of how many numbers the range holds', () => {
    const rules = rulesOf(
      '      - at: A1:A9\n        top: { count: 50, percent: true }\n        style: a\n',
    );
    const values = { A1: 1, A2: 2, A3: 3, A4: 4 };

    expect(over(rules, values, 'A4')).toEqual(['font.bold']);
    expect(over(rules, values, 'A3')).toEqual(['font.bold']);
    expect(over(rules, values, 'A2')).toEqual([]);
  });

  it('ranks numbers only, since text has no place in a ranking', () => {
    const rules = rulesOf('      - at: A1:A9\n        top: 1\n        style: a\n');

    expect(over(rules, { A1: 5, A2: 'zzz' }, 'A2')).toEqual([]);
    expect(over(rules, { A1: 5, A2: 'zzz' }, 'A1')).toEqual(['font.bold']);
  });

  it('marks what appears more than once, and what appears exactly once', () => {
    const twice = rulesOf('      - at: A1:A9\n        duplicate: true\n        style: a\n');
    const once = rulesOf('      - at: A1:A9\n        unique: true\n        style: a\n');
    const values = { A1: 'x', A2: 'x', A3: 'y' };

    expect(over(twice, values, 'A1')).toEqual(['font.bold']);
    expect(over(twice, values, 'A3')).toEqual([]);
    expect(over(once, values, 'A3')).toEqual(['font.bold']);
    expect(over(once, values, 'A1')).toEqual([]);
  });

  it('counts a blank as nothing, which is what Excel does with one', () => {
    const once = rulesOf('      - at: A1:A9\n        unique: true\n        style: a\n');

    expect(over(once, { A1: null, A2: 'x' }, 'A1')).toEqual([]);
    expect(over(once, { A1: null, A2: 'x' }, 'A2')).toEqual(['font.bold']);
  });
});

describe('the rules that draw a look of their own', () => {
  /** The range's values as the sheet holds them, and what the rules make of one cell. */
  function over(rules: readonly CompiledRule[], values: Record<string, number>) {
    const written = Object.keys(values).map(at);
    const held = (one: A1Addr) => (values[String(one)] ?? null) as never;
    const spread = spreads(rules, written, held);

    return {
      fill: (address: string) =>
        settled(
          resolve(
            applied(
              rules,
              { at: at(address), value: held(at(address)), computed: null },
              new Map(),
              spread,
            ),
          ),
        ).fill,
      bar: (address: string) =>
        barAt(rules, { at: at(address), value: held(at(address)), computed: null }, spread),
      icon: (address: string) =>
        iconAt(rules, { at: at(address), value: held(at(address)), computed: null }, spread),
    };
  }

  it('fills a three-colour scale from the low, the median, and the high', () => {
    const rules = rulesOf(
      '      - at: A1:A9\n        color_scale: { low: "FF0000", middle: "00FF00", high: "0000FF" }\n',
    );
    const said = over(rules, { A1: 0, A2: 5, A3: 10 });

    expect(said.fill('A1')).toBe('FF0000');
    expect(said.fill('A2')).toBe('00FF00');
    expect(said.fill('A3')).toBe('0000FF');
  });

  it('mixes a scale in RGB, part of the way between two of its colours', () => {
    const rules = rulesOf(
      '      - at: A1:A9\n        color_scale: { low: "000000", high: "FFFFFF" }\n',
    );

    expect(over(rules, { A1: 0, A2: 1, A3: 2 }).fill('A2')).toBe('808080');
  });

  it('draws a bar as far along as the value is between the low and the high', () => {
    const rules = rulesOf('      - at: A1:A9\n        data_bar: { color: "638EC6" }\n');
    const said = over(rules, { A1: 0, A2: 5, A3: 10 });

    expect(said.bar('A1')?.fraction).toBe(0);
    expect(said.bar('A2')?.fraction).toBe(0.5);
    expect(said.bar('A3')?.fraction).toBe(1);
    expect(said.bar('A2')?.color).toBe('638EC6');
  });

  it('draws neither for a cell holding no number, and neither outside the range', () => {
    const rules = rulesOf(
      '      - at: A1:A2\n        data_bar: { color: "638EC6" }\n      - at: A1:A2\n        color_scale: { low: "000000", high: "FFFFFF" }\n',
    );
    const said = over(rules, { A1: 1, A2: 2 });

    expect(said.bar('B1')).toBeNull();
    expect(said.fill('B1')).toBeUndefined();
  });

  it('gives a three-icon set its icons at the thresholds yxl writes, 0/33/67', () => {
    const rules = rulesOf('      - at: A1:A9\n        icon_set: 3TrafficLights1\n');
    const said = over(rules, { A1: 0, A2: 40, A3: 70, A4: 100 });

    expect(said.icon('A1')?.index).toBe(0);
    expect(said.icon('A2')?.index).toBe(1);
    expect(said.icon('A3')?.index).toBe(2);
    expect(said.icon('A4')?.index).toBe(2);
  });

  it('gives a five-icon set five steps, which is 0/20/40/60/80', () => {
    const rules = rulesOf('      - at: A1:A9\n        icon_set: 5Arrows\n');
    const said = over(rules, { A1: 0, A2: 25, A3: 50, A4: 75, A5: 100 });

    expect([1, 2, 3, 4, 5].map((one) => said.icon(`A${one}`)?.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('turns the set round where the rule says to, and carries `icons_only`', () => {
    const rules = rulesOf(
      '      - at: A1:A9\n        icon_set: { style: 3Arrows, reverse: true, icons_only: true }\n',
    );
    const said = over(rules, { A1: 0, A2: 100 });

    expect(said.icon('A1')?.index).toBe(2);
    expect(said.icon('A2')?.index).toBe(0);
    expect(said.icon('A1')?.iconsOnly).toBe(true);
  });

  it('gives no icon to a cell holding no number', () => {
    const rules = rulesOf('      - at: A1:A9\n        icon_set: 3Arrows\n');
    const written = [at('A1')];
    const held = () => 'text' as never;

    expect(
      iconAt(
        rules,
        { at: at('A1'), value: 'text' as never, computed: null },
        spreads(rules, written, held),
      ),
    ).toBeNull();
  });
});
