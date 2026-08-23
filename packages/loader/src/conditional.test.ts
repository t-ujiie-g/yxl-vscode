import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { load } from './load';

/** The rules of a sheet written with the body given, which is what the reader answers. */
function rules(body: string) {
  const source = `sheets:\n  - name: S\n    conditional:\n${body}`;
  const { doc, diagnostics } = load(parse(source, { file: 'spec.yxl.yaml' }));
  const sheet = doc?.sheets[0];
  if (sheet === undefined) throw new Error('no sheet loaded');

  return { rules: sheet.conditional, codes: diagnostics.map((one) => one.code) };
}

describe('a `conditional:` rule', () => {
  it('reads a `cell` comparison, the range, and the style it applies', () => {
    const read = rules(
      '      - at: B2:B50\n        cell: { at_least: 1000000 }\n        style: strong\n',
    );

    expect(read.codes).toEqual([]);
    expect(read.rules).toHaveLength(1);
    expect(read.rules[0]?.at).toBe('B2:B50');
    expect(read.rules[0]?.test).toEqual({
      kind: 'cell',
      compares: { kind: 'at_least', bound: 1000000 },
    });
    expect(read.rules[0]?.style).toEqual({ kind: 'ref', name: 'strong' });
    expect(read.rules[0]?.stopIfTrue).toBe(false);
  });

  it('reads the two-bound comparisons as the pair they are written as', () => {
    const read = rules(
      '      - at: B2:B9\n        cell: { between: [1, 10] }\n        style: strong\n',
    );

    expect(read.rules[0]?.test).toEqual({
      kind: 'cell',
      compares: { kind: 'between', low: 1, high: 10 },
    });
  });

  it('reads a `text` rule, and `stop_if_true` where it is written', () => {
    const read = rules(
      '      - at: C2:C50\n        text: { contains: urgent }\n        style: weak\n        stop_if_true: true\n',
    );

    expect(read.rules[0]?.test).toEqual({
      kind: 'text',
      asks: { kind: 'contains', text: 'urgent' },
    });
    expect(read.rules[0]?.stopIfTrue).toBe(true);
  });

  it('reads a `formula` rule without the `=` a writer may put in front of it', () => {
    const read = rules(
      '      - at: D2:D9\n        formula: "AND($D2>0, $E2<0)"\n        style: strong\n',
    );

    expect(read.rules[0]?.test).toEqual({ kind: 'formula', body: 'AND($D2>0, $E2<0)' });
  });

  it('reads a ranked rule as a bare count, and as a percentage', () => {
    const bare = rules('      - at: E2:E9\n        top: 10\n        style: strong\n');
    expect(bare.rules[0]?.test).toEqual({ kind: 'top', count: 10, percent: false });

    const part = rules(
      '      - at: E2:E9\n        bottom: { count: 5, percent: true }\n        style: weak\n',
    );
    expect(part.rules[0]?.test).toEqual({ kind: 'bottom', count: 5, percent: true });
  });

  it('reads the three that draw an appearance of their own', () => {
    const scale = rules(
      '      - at: G2:G9\n        color_scale: { low: "F8696B", middle: "FFEB84", high: "63BE7B" }\n',
    );
    expect(scale.rules[0]?.test).toEqual({
      kind: 'colorScale',
      low: 'F8696B',
      middle: 'FFEB84',
      high: '63BE7B',
    });

    const bar = rules('      - at: H2:H9\n        data_bar: { color: "638EC6", bar_only: true }\n');
    expect(bar.rules[0]?.test).toEqual({ kind: 'dataBar', color: '638EC6', barOnly: true });

    const icons = rules('      - at: I2:I9\n        icon_set: 3TrafficLights1\n');
    expect(icons.rules[0]?.test).toEqual({
      kind: 'iconSet',
      name: '3TrafficLights1',
      reverse: false,
      iconsOnly: false,
    });
  });

  it('keeps the rules in the order written, which is the order they apply in', () => {
    const read = rules(
      '      - at: A1:A9\n        cell: { equals: one }\n        style: a\n      - at: A1:A9\n        cell: { equals: two }\n        style: b\n',
    );

    expect(read.rules.map((one) => one.style)).toEqual([
      { kind: 'ref', name: 'a' },
      { kind: 'ref', name: 'b' },
    ]);
  });

  it('reports a key the rule does not have', () => {
    const read = rules(
      '      - at: A1:A9\n        cell: { equals: one }\n        style: a\n        nosuch: 1\n',
    );
    expect(read.codes).toEqual(['loader.unknown-key']);
  });
});
