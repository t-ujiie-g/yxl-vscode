import { parseColor } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { english, spec } from './harness';
import { lookOf, type Merging, proposals, sites } from './proposal';

/** A spec holding one of each: two definitions alike, three looks written out, a column of formulas. */
const EVERYTHING = `defs:
  styles:
    header: { font: { bold: true }, fill: "DDEBF7" }
    midashi: { font: { bold: true }, fill: "DDEBF7" }

sheets:
  - name: Sales
    cells:
      A1: { value: 1, style: header }
      B1: { value: 2, style: midashi }
      A7: { value: 7, style: { font: { italic: true }, fill: "EDEDED" } }
      B7: { value: 8, style: { font: { italic: true }, fill: "EDEDED" } }
      C7: { value: 9, style: { font: { italic: true }, fill: "EDEDED" } }
      A2: 10
      A3: 20
      A4: 30
      C2: { formula: "A2*1.1" }
      C3: { formula: "A3*1.1" }
      C4: { formula: "A4*1.1" }
`;

describe('every tidy-up a spec allows', () => {
  it('offers one of each kind, in the order the reader is asked to choose from', () => {
    expect(proposals(spec(EVERYTHING)).map((one) => one.kind)).toEqual([
      'merge',
      'gather',
      'range',
    ]);
  });

  it('says each of them in the reader s own words', () => {
    expect(proposals(spec(EVERYTHING)).map((one) => english(one.what))).toEqual([
      'Leave one of the 2 definitions that say the same thing, and let the rest follow it',
      'Gather the look written at 3 places into one `defs.styles` entry',
      'Say the 3 formulas over `C2:C4` once, as the range that fills them',
    ]);
  });

  it('gives every proposal an id of its own, since one is chosen by it', () => {
    const ids = proposals(spec(EVERYTHING)).map((one) => one.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers nothing over a spec that repeats nothing', () => {
    const source = 'sheets:\n  - name: Sales\n    cells:\n      A1: 1\n      A2: 2\n';

    expect(proposals(spec(source))).toEqual([]);
  });
});

describe('how many places a proposal would rewrite', () => {
  it('counts the sites a look is gathered from', () => {
    const found = proposals(spec(EVERYTHING));
    const gather = found.find((one) => one.kind === 'gather');

    expect(sites(gather as never)).toBe(3);
  });

  it('counts a merge as the readers it moves plus the definitions it takes away', () => {
    // Two definitions and two readers: one reader follows the name kept, and one
    // definition stays — so what moves is one reader and one definition.
    const found = proposals(spec(EVERYTHING));
    const merge = found.find((one) => one.kind === 'merge') as Merging;

    expect([merge.at.length, merge.defs.length, sites(merge)]).toEqual([2, 2, 3]);
  });
});

describe('a look as a spec would write it', () => {
  it('is the same string for two looks that say the same thing', () => {
    expect(lookOf({ 'font.bold': true })).toBe(lookOf({ 'font.bold': true }));
  });

  it('is what the definition is given, so the key a group is gathered by is its body', () => {
    const fill = parseColor('DDEBF7');
    if (fill === null) throw new Error('not a colour');

    expect(lookOf({ 'font.bold': true, fill })).toBe('{ font: { bold: true }, fill: "DDEBF7" }');
  });
});
