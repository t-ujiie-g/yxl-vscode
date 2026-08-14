import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import type { SpecDoc } from '@yxl-vscode/spec';
import { filePath } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { type Sample, yxlExamples } from './corpus';

/**
 * The half of `$include` that belongs to the shell (ADR-004): resolve the path
 * against the file that wrote it, and read it.
 */
const include: IncludeReader = (from, path) => {
  const resolved = resolve(dirname(from), path);
  const file = filePath(resolved);
  if (file === null) return null;

  try {
    return { file, source: readFileSync(resolved, 'utf8') };
  } catch {
    return null;
  }
};

/**
 * A spec, rather than one of the fragments an `$include` pulls into one. A
 * fragment is a `columns:` sequence or a `defs.styles` mapping with no document
 * around it, and reading one as a document would say only that it is not one.
 */
function isDocument(sample: Sample): boolean {
  const { root } = parse(sample.source, { file: sample.name });
  return root?.kind === 'map' && root.entries.some((entry) => entry.key.value === 'sheets');
}

const documents = yxlExamples().filter(isDocument);

function read(sample: Sample) {
  return load(parse(sample.source, { file: sample.path }), include);
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
    // A node whose file is not the document's own came through an `$include`.
    includes: docs.some((doc) => filesIn(doc).some((file) => file !== doc.file)),
    merges: sheets.some((sheet) => sheet.merges.length > 0),
    opaque: sheets.some((sheet) => sheet.opaque.length > 0),
    params: docs.some((doc) => doc.params.length > 0),
    rows: sheets.some((sheet) => sheet.rows.length > 0),
  };
}
