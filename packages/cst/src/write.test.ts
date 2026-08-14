import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { renderScalar, type Value } from './write';

describe('renderScalar', () => {
  it('writes the scalar types', () => {
    expect(renderScalar(null)).toBe('null');
    expect(renderScalar(true)).toBe('true');
    expect(renderScalar(false)).toBe('false');
    expect(renderScalar(42)).toBe('42');
    expect(renderScalar(-0.5)).toBe('-0.5');
  });

  it('writes the infinities and NaN in YAML spelling, not JavaScript', () => {
    expect(renderScalar(Number.POSITIVE_INFINITY)).toBe('.inf');
    expect(renderScalar(Number.NEGATIVE_INFINITY)).toBe('-.inf');
    expect(renderScalar(Number.NaN)).toBe('.nan');
  });

  it('leaves ordinary text plain', () => {
    expect(renderScalar('APAC')).toBe('APAC');
    expect(renderScalar('Revenue 2026')).toBe('Revenue 2026');
    expect(renderScalar('A1:B2')).toBe('A1:B2');
  });

  describe('quotes text that would otherwise read back as something else', () => {
    it.each([
      ['007', '"007"'],
      ['42', '"42"'],
      ['1.5', '"1.5"'],
      ['true', '"true"'],
      ['null', '"null"'],
      ['~', '"~"'],
      ['.inf', '".inf"'],
      ['', '""'],
    ])('%s', (value, expected) => {
      expect(renderScalar(value)).toBe(expected);
    });
  });

  describe('quotes text the syntax would misread', () => {
    it.each([
      ['a: b', '"a: b"'],
      ['a # b', '"a # b"'],
      ['- item', '"- item"'],
      ['{a}', '"{a}"'],
      ['[a]', '"[a]"'],
      ['*ref', '"*ref"'],
      ['&anchor', '"&anchor"'],
      [' padded', '" padded"'],
      ['trailing ', '"trailing "'],
      ['ends:', '"ends:"'],
    ])('%s', (value, expected) => {
      expect(renderScalar(value)).toBe(expected);
    });
  });

  it('leaves a quote mid-word plain, which YAML allows', () => {
    expect(renderScalar('say "hi"')).toBe('say "hi"');
  });

  it('escapes what a double-quoted scalar cannot hold literally', () => {
    expect(renderScalar('say "hi"', 'double')).toBe('"say \\"hi\\""');
    expect(renderScalar('back\\slash', 'double')).toBe('"back\\\\slash"');
    expect(renderScalar('two\nlines')).toBe('"two\\nlines"');
    expect(renderScalar('a\tb')).toBe('"a\\tb"');
  });

  describe('keeping the style a node already had', () => {
    it('keeps double quotes', () => {
      expect(renderScalar('EMEA', 'double')).toBe('"EMEA"');
    });

    it('keeps single quotes, doubling an apostrophe as that style requires', () => {
      expect(renderScalar("it's", 'single')).toBe("'it''s'");
    });

    it('abandons single quotes for a value they cannot carry', () => {
      expect(renderScalar('two\nlines', 'single')).toBe('"two\\nlines"');
    });

    it('does not quote a number just because the node it replaces was quoted', () => {
      expect(renderScalar(42, 'double')).toBe('42');
    });
  });
});

describe('what renderScalar writes, parse reads back unchanged', () => {
  // The writer and the reader are the two halves of one contract. If they ever
  // disagree, a value the editor wrote reads back as a different type on the
  // next open — silent, and a workbook away from anyone noticing. Going through
  // the real parser asserts that directly, whatever quoting decision was made
  // on the way.
  function roundTrip(value: Value): Value {
    const written = renderScalar(value);
    const { root, diagnostics } = parse(`key: ${written}\n`, { file: 'written.yaml' });
    expect(diagnostics, `writing ${JSON.stringify(value)} produced ${written}`).toEqual([]);

    if (root?.kind !== 'map') throw new Error(`writing ${JSON.stringify(value)} gave ${written}`);
    const read = root.entries[0]?.value;
    if (read?.kind !== 'scalar')
      throw new Error(`writing ${JSON.stringify(value)} gave ${written}`);
    return read.value;
  }

  const values: Value[] = [
    'APAC',
    '007',
    '42',
    'true',
    'null',
    '',
    'a: b',
    'a # b',
    'say "hi"',
    "it's",
    '- item',
    'A1:B2',
    '2026-08-15',
    '\u65e5\u672c\u8a9e',
    'two\nlines',
    0,
    42,
    -17,
    1.5,
    -0.5,
    1e21,
    true,
    false,
    null,
  ];

  it.each(values.map((v) => [JSON.stringify(v), v] as const))('%s', (_label, value) => {
    expect(roundTrip(value)).toEqual(value);
  });
});
