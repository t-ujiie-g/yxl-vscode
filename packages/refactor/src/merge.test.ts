import { describe, expect, it } from 'vitest';
import { english, named, ROOT, spec, taken } from './harness';
import { mergePatch, mergeStyles } from './merge';
import type { Merging } from './proposal';

/** The shape a reader hits: three definitions saying one thing, one cell each. */
const THREE = `defs:
  styles:
    header: { font: { bold: true }, fill: "DDEBF7" }
    header1: { font: { bold: true }, fill: "DDEBF7" }
    header2: { font: { bold: true }, fill: "DDEBF7" }

sheets:
  - name: 売上
    cells:
      A1: { value: 支店, style: header }
      B1: { value: 売上, style: header1 }
      C1: { value: 税込, style: header2 }
      A2: 札幌
`;

describe('definitions that say the same thing', () => {
  it('offers to leave one of them standing', () => {
    const found = mergeStyles(spec(THREE));

    expect(found.map((one) => one.names)).toEqual([
      [named('header'), named('header1'), named('header2')],
    ]);
  });

  it('says how many it would gather, in the reader s own words', () => {
    const [one] = mergeStyles(spec(THREE));

    expect(english(one?.what ?? '')).toBe(
      'Leave one of the 3 definitions that say the same thing, and let the rest follow it',
    );
  });

  it('finds every cell that reads one of them', () => {
    const [one] = mergeStyles(spec(THREE));

    expect(one?.at.map((at) => at.name)).toEqual([
      named('header'),
      named('header1'),
      named('header2'),
    ]);
  });

  it('leaves definitions alone that say different things', () => {
    const source = `defs:\n  styles:\n    a: { font: { bold: true } }\n    b: { font: { italic: true } }\nsheets:\n  - name: S\n    cells:\n      A1: { value: 1, style: a }\n`;

    expect(mergeStyles(spec(source))).toEqual([]);
  });

  it('leaves alone a set whose definitions another file writes', () => {
    const source = `defs:\n  styles:\n    $include: theme.yaml\nsheets:\n  - name: S\n    cells:\n      A1: { value: 1, style: a }\n`;
    const files = {
      [ROOT]: source,
      'theme.yaml': 'a: { font: { bold: true } }\nb: { font: { bold: true } }\n',
    };

    expect(mergeStyles(spec(files))).toEqual([]);
  });
});

describe('the patch a merge makes', () => {
  function merged(source: string, keep: string) {
    const of = spec(source);

    return taken(of, mergePatch(mergeStyles(of)[0] as Merging, named(keep)));
  }

  it('takes away the definitions it replaces and points every reader at the one kept', () => {
    const { text } = merged(THREE, 'header');

    expect(text).toBe(
      'defs:\n  styles:\n    header: { font: { bold: true }, fill: "DDEBF7" }\n\n' +
        'sheets:\n  - name: 売上\n    cells:\n' +
        '      A1: { value: 支店, style: header }\n' +
        '      B1: { value: 売上, style: header }\n' +
        '      C1: { value: 税込, style: header }\n' +
        '      A2: 札幌\n',
    );
  });

  it('passes the gate that says a refactor changes no rendered cell', () => {
    expect(merged(THREE, 'header').passes).toBe(true);
  });

  it('keeps whichever of them the reader chose, not the first', () => {
    const { text, passes } = merged(THREE, 'header2');

    expect([text.includes('    header2:'), text.includes('style: header2 }'), passes]).toEqual([
      true,
      true,
      true,
    ]);
  });
});

describe('a merge where a definition is named outside a cell (#217)', () => {
  const DEFS =
    'defs:\n  styles:\n    a: { font: { bold: true } }\n    b: { font: { bold: true } }\n';
  const SHEET = 'sheets:\n  - name: S\n    cells:\n      A1: 1\n';
  const LAYOUT = `${SHEET}    layouts:\n      - at: C1\n        values: [[x, 1]]\n`;

  function merged(source: string) {
    const of = spec(source);
    const found = mergeStyles(of)[0];
    if (found === undefined) throw new Error('nothing was offered');

    return taken(of, mergePatch(found, named('a')));
  }

  it.each([
    [
      'an `extends:` in another definition',
      `${DEFS}    c: { extends: b, font: { italic: true } }\n${SHEET}      A2: { value: 2, style: c }\n`,
      'c: { extends: a,',
    ],
    [
      'an `extends:` in a style written in place',
      `${DEFS}${SHEET}      A2: { value: 2, style: { extends: b, fill: "FF0000" } }\n`,
      'style: { extends: a,',
    ],
    [
      'a column band',
      `${DEFS}${SHEET}    columns:\n      - { at: A, style: b }\n`,
      '- { at: A, style: a }',
    ],
    [
      'a row band',
      `${DEFS}${SHEET}    rows:\n      - { at: 1, style: b }\n`,
      '- { at: 1, style: a }',
    ],
    [
      'a conditional format',
      `${DEFS}${SHEET}    conditional:\n      - { at: A1:A1, cell: { greater_than: 0 }, style: b }\n`,
      'style: a }',
    ],
    [
      'an override',
      `${DEFS}${SHEET}overrides:\n  - { at: S!A1, style: b }\n`,
      '- { at: S!A1, style: a }',
    ],
    [
      'a layout column',
      `${DEFS}${LAYOUT}        columns: [{ name: n, style: b }, { name: v }]\n`,
      '{ name: n, style: a }',
    ],
    [
      "a layout's header style",
      `${DEFS}${LAYOUT}        header_style: b\n        columns: [{ name: n, header: N }, { name: v }]\n`,
      'header_style: a',
    ],
    [
      'a footer row',
      `${DEFS}${LAYOUT}        columns: [{ name: n }, { name: v }]\n        footer:\n          - row: { v: { total: sum } }\n            style: b\n`,
      '            style: a',
    ],
    [
      'a rule of a layout column',
      `${DEFS}${LAYOUT}        columns: [{ name: n }, { name: v, conditional: [{ cell: { greater_than: 0 }, style: b }] }]\n`,
      'style: a }] }',
    ],
  ])('rewrites %s, and the gate lets it through', (_label, source, after) => {
    const { text, passes } = merged(source);

    expect([text.includes(after), text.includes('    b:'), passes]).toEqual([true, false, true]);
  });

  it('is not offered where a definition is named from a file this cannot write', () => {
    const files = {
      [ROOT]: `${DEFS}sheets:\n  - $include: s.yaml\n`,
      's.yaml': 'name: S\ncells:\n  A1: { value: 1, style: b }\n',
    };

    expect(mergeStyles(spec(files))).toEqual([]);
  });

  it('is not offered where one of them extends the other, which keeping either would break', () => {
    const source = `defs:\n  styles:\n    a: { font: { bold: true } }\n    b: { extends: a }\n${SHEET}`;

    expect(mergeStyles(spec(source))).toEqual([]);
  });

  it('is not offered where a style is named by a parameter, which could be either', () => {
    const source = `params:\n  look: b\n${DEFS}${SHEET}      A2: { value: 2, style: "\${look}" }\n`;

    expect(mergeStyles(spec(source))).toEqual([]);
  });
});

describe('definitions too few to be worth merging', () => {
  it('leaves a single definition alone, however many cells read it', () => {
    const source = `defs:\n  styles:\n    header: { font: { bold: true } }\nsheets:\n  - name: S\n    cells:\n      A1: { value: 1, style: header }\n      A2: { value: 2, style: header }\n`;

    expect(mergeStyles(spec(source))).toEqual([]);
  });
});
