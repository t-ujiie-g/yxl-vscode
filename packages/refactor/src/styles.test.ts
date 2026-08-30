import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { reading as wording } from '@yxl-vscode/diag';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { applyPatch } from '@yxl-vscode/patch';
import { type FilePath, filePath, type StyleName, styleName } from '@yxl-vscode/units';
import { type Ctx, checked, nothingChanges } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import type { Gathering, Proposing } from './proposal';
import { gatherPatch, gatherStyles, suggestedName, WORTH_EXTRACTING } from './styles';
import { WORDS } from './text';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);
const english = wording('en', WORDS);

function named(name: string): StyleName {
  const read = styleName(name);
  if (read === null) throw new Error(`not a style name: ${name}`);
  return read;
}

/** A spec as a test writes one, loaded and compiled the way the host loads it. */
function spec(of: string | Record<string, string>): Proposing & { ctx: Ctx; source: string } {
  const sources = typeof of === 'string' ? { [ROOT]: of } : of;
  const read: IncludeReader = (_from, path) =>
    sources[path] === undefined ? null : { file: filePath(path) ?? ROOT, source: sources[path] };

  const trees = new Map<string, ReturnType<typeof parse>>();
  const parsed = (file: FilePath) => {
    if (!trees.has(file)) trees.set(file, parse(sources[file] ?? '', { file }));
    return trees.get(file) ?? null;
  };

  const { doc } = load(parse(sources[ROOT] ?? '', { file: ROOT }), read);
  if (doc === null) throw new Error('did not load');

  return {
    doc,
    grid: compile(doc, { read }),
    parsed,
    ctx: { root: ROOT, file: ROOT, read },
    source: sources[ROOT] ?? '',
  };
}

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

describe('the patch a proposal makes', () => {
  /** The proposal over a spec, taken with a name, as the file it would leave behind. */
  function gathered(source: string, name = 'header'): { text: string; passes: boolean } {
    const of = spec(source);
    const one = gatherStyles(of)[0] as Gathering;
    const patch = gatherPatch(one, named(name));
    const gate = checked(of.source, patch, nothingChanges, of.ctx);

    return { text: applyPatch(of.source, patch, { file: ROOT }).text, passes: gate.ok === true };
  }

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
