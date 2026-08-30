import { describe, expect, it } from 'vitest';
import { english, named, ROOT, spec, taken } from './harness';
import type { Gathering } from './proposal';
import { gatherPatch, gatherStyles, suggestedName, WORTH_EXTRACTING } from './styles';

/** A spec as a test writes one, loaded and compiled the way the host loads it. */
const BLUE = '{ font: { bold: true }, fill: "#DDEBF7" }';

/** A sheet whose `A1`..`A<n>` all write the same look out in full. */
function repeating(times: number, look = BLUE): string {
  const cells = Array.from(
    { length: times },
    (_, i) => `      A${i + 1}: { value: ${i + 1}, style: ${look} }\n`,
  ).join('');

  return `sheets:\n  - name: Sales\n    cells:\n${cells}`;
}

describe('gathering a look that is written out in full', () => {
  it('proposes one definition for a look enough places repeat', () => {
    const found = gatherStyles(spec(repeating(WORTH_EXTRACTING)));

    expect(found.map((one) => ({ sites: one.at.length, source: one.source }))).toEqual([
      { sites: WORTH_EXTRACTING, source: BLUE },
    ]);
  });

  it('says how many places it would gather, in the reader s own words', () => {
    const [one] = gatherStyles(spec(repeating(4)));

    expect(english(one?.what ?? '')).toBe(
      'Gather the look written at 4 places into one `defs.styles` entry',
    );
  });

  it('leaves a look alone that too few places repeat', () => {
    expect(gatherStyles(spec(repeating(WORTH_EXTRACTING - 1)))).toEqual([]);
  });

  it('leaves alone a look the cells already read from a definition', () => {
    const source = `defs:\n  styles:\n    header: { font: { bold: true } }\n${repeating(4, 'header')}`;

    expect(gatherStyles(spec(source))).toEqual([]);
  });

  it('offers a name from what the look says, rather than a number', () => {
    const [one] = gatherStyles(spec(repeating(3)));

    expect(one?.suggested).toBe('bold-ddebf7');
  });

  it('names the definitions already taken, so a caller can refuse a clash', () => {
    const source = `defs:\n  styles:\n    header: { font: { italic: true } }\n${repeating(3)}`;
    const [one] = gatherStyles(spec(source));

    expect(one?.taken).toEqual([named('header')]);
  });

  it('leaves the spec alone where `defs:` is another file s to write', () => {
    const source = `defs:\n  $include: theme.yaml\n${repeating(4)}`;
    const files = { [ROOT]: source, 'theme.yaml': 'styles:\n  header: { font: { bold: true } }\n' };

    expect(gatherStyles(spec(files))).toEqual([]);
  });
});

/** The proposal over a spec, taken with a name, as the file it would leave behind. */
function gathered(source: string, name = 'header') {
  const of = spec(source);

  return taken(of, gatherPatch(gatherStyles(of)[0] as Gathering, named(name)));
}

describe('the patch a proposal makes', () => {
  it('writes the definition and points every site at it', () => {
    const { text } = gathered(repeating(3));

    expect(text).toBe(
      'sheets:\n  - name: Sales\n    cells:\n' +
        '      A1: { value: 1, style: header }\n' +
        '      A2: { value: 2, style: header }\n' +
        '      A3: { value: 3, style: header }\n' +
        'defs:\n  styles:\n    header: { font: { bold: true }, fill: "#DDEBF7" }\n',
    );
  });

  it('passes the gate that says a refactor changes no rendered cell', () => {
    expect(gathered(repeating(3)).passes).toBe(true);
  });

  it('puts the definition under a `defs:` the spec already has', () => {
    const source = `defs:\n  values:\n    rate: 0.08\n${repeating(3)}`;

    expect(gathered(source).text).toContain('  styles:\n    header:');
  });

  it('puts the definition beside the ones `defs.styles:` already holds', () => {
    const source = `defs:\n  styles:\n    total: { font: { italic: true } }\n${repeating(3)}`;
    const { text, passes } = gathered(source);

    expect([text.includes('    total:'), text.includes('    header:'), passes]).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('is refused by the gate when the name it is given already means something else', () => {
    // `total` resolves to the italic look, so every gathered site would change:
    // the claim of changing nothing is what fails, without anyone checking by eye.
    const source = `defs:\n  styles:\n    total: { font: { italic: true } }\n${repeating(3)}`;

    expect(gathered(source, 'total').passes).toBe(false);
  });
});

describe('a name suggested for a look', () => {
  it('falls back to a plain word where the look says nothing nameable', () => {
    expect(suggestedName({ 'align.horizontal': 'center' })).toBe('style');
  });

  it('reads bold and italic and the fill it wears', () => {
    expect(suggestedName({ 'font.bold': true, 'font.italic': true })).toBe('bold-italic');
  });
});

describe('the exceptions a spec accumulates', () => {
  /** Three `overrides:` marking a hand-corrected row, each restating the look. */
  const MARKED = `sheets:
  - name: Sales
    cells:
      A1: { value: 1 }
      A2: { value: 2 }
      A3: { value: 3 }
overrides:
  - at: Sales!A1
    style: { font: { italic: true }, fill: "FCE4D6" }
    reason: "corrected by hand"
  - at: Sales!A2
    style: { font: { italic: true }, fill: "FCE4D6" }
    reason: "corrected by hand"
  - at: Sales!A3
    style: { font: { italic: true }, fill: "FCE4D6" }
    reason: "corrected by hand"
`;

  it('gathers a look the exceptions restate, as it does one the cells restate', () => {
    const [one] = gatherStyles(spec(MARKED));

    expect({ sites: one?.at.length, suggested: one?.suggested }).toEqual({
      sites: 3,
      suggested: 'italic-fce4d6',
    });
  });

  it('writes the definition and leaves each exception its reason', () => {
    const { text } = gathered(MARKED, 'patched');

    expect([
      text.includes('    patched: { font: { italic: true }, fill: "FCE4D6" }'),
      text.split('style: patched').length - 1,
      text.split('reason: "corrected by hand"').length - 1,
    ]).toEqual([true, 3, 3]);
  });

  it('passes the gate, since an exception reading a name is the look it restated', () => {
    expect(gathered(MARKED, 'patched').passes).toBe(true);
  });

  it('counts a cell and an exception together, since one name serves both', () => {
    const source = `${MARKED.replace('      A3: { value: 3 }', '      A3: { value: 3, style: { font: { italic: true }, fill: "FCE4D6" } }')}`;
    const [one] = gatherStyles(spec(source));

    expect(one?.at.length).toBe(4);
  });
});
