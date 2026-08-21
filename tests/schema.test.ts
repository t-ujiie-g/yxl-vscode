import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import type { SpecDoc } from '@yxl-vscode/spec';
import { describe, expect, it } from 'vitest';
import { includeReader, type Sample, yxlExamples } from './corpus';

/** A spec, rather than a fragment an `$include` pulls into one. */
function isDocument(sample: Sample): boolean {
  const { root } = parse(sample.source, { file: sample.name });
  return root?.kind === 'map' && root.entries.some((entry) => entry.key.value === 'sheets');
}

const documents = yxlExamples().filter(isDocument);

function read(sample: Sample) {
  return load(parse(sample.source, { file: sample.path }), includeReader);
}

describe('the upstream specs', () => {
  it('are found', () => {
    expect(documents.length).toBeGreaterThan(0);
  });

  it('exercise every construct the loader models', () => {
    // Without this, the assertion below would also pass on a loader that read
    // nothing at all.
    const docs = documents.map((sample) => read(sample).doc).filter((doc) => doc !== null);
    expect(seen(docs)).toEqual({
      cells: true,
      columns: true,
      data: true,
      defs: true,
      formulas: true,
      freeze: true,
      includes: true,
      merges: true,
      opaque: true,
      params: true,
      rows: true,
    });
  });
});

describe.each(documents)('$name', (sample) => {
  it('loads with nothing left unread', () => {
    // The strongest check available on whether the schema was read correctly:
    // one diagnostic means a key, a value form, or a vocabulary was misread,
    // over specs the upstream project compiles on every commit.
    const { doc, diagnostics } = read(sample);
    expect(diagnostics).toEqual([]);
    expect(doc).not.toBeNull();
  });

  it('draws with nothing left undrawn', () => {
    // A diagnostic here is the projection disagreeing with a spec the compiler builds.
    const { doc } = read(sample);
    if (doc === null) throw new Error('did not load');

    const drawn = compile(doc, { read: includeReader });
    expect(drawn.diagnostics).toEqual([]);
    expect(drawn.sheets.length).toBeGreaterThan(0);
  });
});

/** The file every node of a document was written in. */
function filesIn(doc: SpecDoc): string[] {
  const inSheets = doc.sheets.flatMap((sheet) => [
    sheet,
    ...sheet.cells,
    ...sheet.columns,
    ...sheet.rows,
    ...sheet.data,
    ...sheet.merges,
    ...sheet.formulas,
    ...sheet.opaque,
  ]);
  const declared = [...doc.defs.styles, ...doc.defs.values, ...doc.defs.formulas, ...doc.params];
  return [...inSheets, ...declared, ...doc.opaque].map((node) => node.file);
}

function seen(docs: readonly SpecDoc[]): Record<string, boolean> {
  const sheets = docs.flatMap((doc) => doc.sheets);
  return {
    cells: sheets.some((sheet) => sheet.cells.length > 0),
    columns: sheets.some((sheet) => sheet.columns.length > 0),
    data: sheets.some((sheet) => sheet.data.length > 0),
    defs: docs.some((doc) => doc.defs.styles.length + doc.defs.values.length > 0),
    formulas: sheets.some((sheet) => sheet.formulas.length > 0),
    freeze: sheets.some((sheet) => sheet.freeze !== null),
    // A node whose file is not the document's own came through an `$include`.
    includes: docs.some((doc) => filesIn(doc).some((file) => file !== doc.file)),
    merges: sheets.some((sheet) => sheet.merges.length > 0),
    opaque: sheets.some((sheet) => sheet.opaque.length > 0),
    params: docs.some((doc) => doc.params.length > 0),
    rows: sheets.some((sheet) => sheet.rows.length > 0),
  };
}
