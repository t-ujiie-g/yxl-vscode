import { compile } from '@yxl-vscode/compile';
import { type Node, parse } from '@yxl-vscode/cst';
import { chartOver, type Intent, imageAt, moveFloat, reading, sizeFloat } from '@yxl-vscode/intent';
import { load } from '@yxl-vscode/loader';
import { applyPatch, type Patch } from '@yxl-vscode/patch';
import { MODELED_KEYS, type Opaque, type SpecDoc } from '@yxl-vscode/spec';
import type { A1Addr, FilePath, SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { includeReader, type Sample, yxlExamples } from './corpus';

/** ADR-011's other half over yxl's own examples: what is not modeled is carried through untouched. */
const specs = yxlExamples().filter((sample) => sample.name.endsWith('.yxl.yaml'));

/** Every construct this editor does not model, in the order the spec wrote them. */
function carried(doc: SpecDoc, file: string): Opaque[] {
  const all = [...doc.opaque, ...doc.sheets.flatMap((sheet) => sheet.opaque)];
  return all.filter((one) => one.file === file);
}

function read(sample: Sample, source: string): SpecDoc {
  const { doc } = load(parse(source, { file: sample.path }), includeReader);
  if (doc === null) throw new Error(`${sample.name} did not load`);
  return doc;
}

/** The text of each opaque construct, which is the thing that must not move. */
function verbatim(source: string, doc: SpecDoc, file: string): string[] {
  return carried(doc, file).map((one) => source.slice(one.span.start, one.span.end));
}

/** One edit to something modeled: the first cell written as a bare scalar, read off the file. */
function anEdit(source: string, file: string): { path: (string | number)[]; value: string } | null {
  for (const [index, sheet] of sheetsOf(source, file).entries()) {
    const cells = sheet.kind === 'map' ? entry(sheet, 'cells') : undefined;
    if (cells?.kind !== 'map') continue;

    for (const one of cells.entries) {
      if (one.value.kind !== 'scalar' || one.value.source === '') continue;
      return { path: ['sheets', index, 'cells', String(one.key.value)], value: 'SENTINEL' };
    }
  }

  return null;
}

/** Every key a document and its sheets write, which the loader either reads or carries. */
function written(source: string, file: string): { document: string[]; sheets: string[][] } {
  const { root } = parse(source, { file });
  const keys = (node: Node | null): string[] =>
    node?.kind === 'map' ? node.entries.map((one) => String(one.key.value)) : [];

  return { document: keys(root), sheets: sheetsOf(source, file).map(keys) };
}

function sheetsOf(source: string, file: string): Node[] {
  const { root } = parse(source, { file });
  const sheets = root === null ? undefined : entry(root, 'sheets');
  return sheets?.kind === 'seq' ? [...sheets.items] : [];
}

function entry(node: Node, key: string): Node | undefined {
  if (node.kind !== 'map') return undefined;
  return node.entries.find((one) => one.key.value === key)?.value;
}

/**
 * The two keys that are this format's own grammar rather than a construct:
 * `$include` is followed, and `$ref` is resolved (`docs/spec.md` §8, §6).
 */
const GRAMMAR = new Set(['$include', '$ref']);

/**
 * Every write this editor makes *under a sheet*, which is where the constructs
 * it does not model sit: a key going in beside them must not disturb one.
 */
function underSheet(sample: Sample, doc: SpecDoc): { what: string; patch: Patch }[] {
  const grid = compile(doc, { read: includeReader });
  const sheet = grid.sheets[0];
  if (sheet === undefined) return [];

  const spec = { doc, grid };
  const read = reading((file) => (file === sample.path ? sample.source : null));
  const name = sheet.name as SheetName;
  const rect = { top: 1, left: 1, bottom: 2, right: 2 };
  const float = sheet.charts[0] ?? sheet.shapes[0] ?? sheet.images[0] ?? null;

  const made: { what: string; intent: Intent }[] = [
    {
      what: 'a chart put in',
      intent: chartOver(spec, { sheet: name, rect, type: 'column' }, read),
    },
    {
      what: 'an image put in',
      intent: imageAt(spec, { sheet: name, at: 'A1' as A1Addr, path: 'a.png' }, read),
    },
    ...(float === null
      ? []
      : [
          {
            what: 'a float moved',
            intent: moveFloat({ node: float.node, at: 'Z9' as A1Addr }, read),
          },
          {
            what: 'a float resized',
            intent: sizeFloat(
              { node: float.node, width: 300, height: 200, natural: { width: 10, height: 10 } },
              read,
            ),
          },
        ]),
  ];

  return made.flatMap(({ what, intent }) =>
    intent.kind === 'edit' && intent.file === (sample.path as FilePath)
      ? [{ what, patch: intent.patch }]
      : [],
  );
}

describe('the corpus of specs that use what this editor does not model', () => {
  it('holds constructs to preserve, or this suite proves nothing', () => {
    const opaque = specs.flatMap((sample) => carried(read(sample, sample.source), sample.path));
    expect(opaque.length).toBeGreaterThanOrEqual(8);
  });

  it('holds enough specs where an edit and a carried construct meet', () => {
    // A suite that skipped every spec would still be green. The floor falls by
    // one each time a construct stops being opaque, which is the point of it.
    const both = specs.filter(
      (sample) =>
        anEdit(sample.source, sample.path) !== null &&
        carried(read(sample, sample.source), sample.path).length > 0,
    );

    expect(both.length).toBeGreaterThanOrEqual(3);
  });

  it('makes writes under a sheet to try them against, or the suite below proves nothing', () => {
    const writes = specs.flatMap((sample) => underSheet(sample, read(sample, sample.source)));
    expect([...new Set(writes.map((one) => one.what))].sort()).toEqual([
      'a chart put in',
      'a float moved',
      'a float resized',
      'an image put in',
    ]);
  });

  it('names what is still carried, so modelling one of them is a deliberate change', () => {
    const keys = specs.flatMap((sample) =>
      carried(read(sample, sample.source), sample.path).map((one) => one.key),
    );

    // `docs/spec.md` §13's sheet background, §14, §15, §20 and §21. A workbook's
    // own `protect:` would be here too, and no example writes one: upstream
    // refuses it, so a spec that carries it does not build.
    expect([...new Set(keys)].sort()).toEqual([
      'active',
      'background',
      'calc',
      'controls',
      'pivots',
      'properties',
      'slicers',
    ]);
  });
});

describe.each(specs)('$name', (sample) => {
  const doc = read(sample, sample.source);
  const edit = anEdit(sample.source, sample.path);
  const edited = (): string => {
    if (edit === null) throw new Error('nothing to edit');

    const done = applyPatch(
      sample.source,
      { ops: [{ op: 'set', path: edit.path, value: edit.value }] },
      { file: sample.path },
    );
    expect(done.diagnostics).toEqual([]);
    expect(done.text).not.toBe(sample.source);
    return done.text;
  };

  it('marks every key it does not read, rather than letting one fall through', () => {
    // What the spec wrote, minus what the loader reads, is what it must be
    // carrying — computed from the file and the key sets rather than listed
    // here, so a key that stops being modeled cannot pass unnoticed.
    const keys = written(sample.source, sample.path);
    const marked = new Set(carried(doc, sample.path).map((one) => one.key));

    const missed = [
      ...keys.document.filter((key) => !MODELED_KEYS.document.has(key)),
      ...keys.sheets.flat().filter((key) => !MODELED_KEYS.sheet.has(key)),
    ].filter((key) => !marked.has(key) && !GRAMMAR.has(key));

    expect(missed).toEqual([]);
  });

  it('gives every one of them back byte for byte after an edit', () => {
    if (edit === null) return;

    const before = verbatim(sample.source, doc, sample.path);
    if (before.length === 0) return;

    const after = edited();
    expect(verbatim(after, read(sample, after), sample.path)).toEqual(before);
  });

  it('keeps them in the order the spec wrote them', () => {
    if (edit === null) return;

    const after = edited();
    const keys = (of: SpecDoc): string[] => carried(of, sample.path).map((one) => one.key);
    expect(keys(read(sample, after))).toEqual(keys(doc));
  });

  it('gives them back byte for byte after a float is put in, moved, or resized', () => {
    const before = verbatim(sample.source, doc, sample.path);
    if (before.length === 0) return;

    for (const { what, patch } of underSheet(sample, doc)) {
      const done = applyPatch(sample.source, patch, { file: sample.path });
      expect({ what, diagnostics: done.diagnostics }).toEqual({ what, diagnostics: [] });
      expect(done.text).not.toBe(sample.source);

      const after = read(sample, done.text);
      expect({ what, kept: verbatim(done.text, after, sample.path) }).toEqual({
        what,
        kept: before,
      });
      expect({ what, keys: carried(after, sample.path).map((one) => one.key) }).toEqual({
        what,
        keys: carried(doc, sample.path).map((one) => one.key),
      });
    }
  });
});
