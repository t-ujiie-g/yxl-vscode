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

describe('definitions too few to be worth merging', () => {
  it('leaves a single definition alone, however many cells read it', () => {
    const source = `defs:\n  styles:\n    header: { font: { bold: true } }\nsheets:\n  - name: S\n    cells:\n      A1: { value: 1, style: header }\n      A2: { value: 2, style: header }\n`;

    expect(mergeStyles(spec(source))).toEqual([]);
  });
});
