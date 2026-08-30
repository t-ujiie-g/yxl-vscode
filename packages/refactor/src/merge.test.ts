import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { reading as wording } from '@yxl-vscode/diag';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { applyPatch } from '@yxl-vscode/patch';
import { type FilePath, filePath, type StyleName, styleName } from '@yxl-vscode/units';
import { type Ctx, checked, nothingChanges } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { mergePatch, mergeStyles } from './merge';
import type { Merging, Proposing } from './proposal';
import { WORDS } from './text';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);
const english = wording('en', WORDS);

function named(name: string): StyleName {
  const read = styleName(name);
  if (read === null) throw new Error(`not a style name: ${name}`);
  return read;
}

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
  function merged(source: string, keep: string): { text: string; passes: boolean } {
    const of = spec(source);
    const one = mergeStyles(of)[0] as Merging;
    const patch = mergePatch(one, named(keep));
    const gate = checked(of.source, patch, nothingChanges, of.ctx);

    return { text: applyPatch(of.source, patch, { file: ROOT }).text, passes: gate.ok === true };
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
