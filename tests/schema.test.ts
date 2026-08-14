import { parse } from '@yxl-vscode/cst';
import { CODE, load } from '@yxl-vscode/loader';
import type { SpecDoc } from '@yxl-vscode/spec';
import { describe, expect, it } from 'vitest';
import { type Sample, yxlExamples } from './corpus';

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
  return load(parse(sample.source, { file: sample.name }));
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
      merges: true,
      opaque: true,
      params: true,
      rows: true,
    });
  });
});

describe.each(documents)('$name', (sample) => {
  it('loads, and the only thing it cannot read yet is an `$include`', () => {
    // The strongest check available on whether the schema was read correctly:
    // any other code means a key, a value form, or a vocabulary was misread,
    // over specs the upstream project compiles on every commit.
    const { doc, diagnostics } = read(sample);
    expect(doc).not.toBeNull();
    expect(diagnostics.filter((one) => one.code !== CODE.includeNotExpanded)).toEqual([]);
  });
});

function seen(docs: readonly SpecDoc[]): Record<string, boolean> {
  const sheets = docs.flatMap((doc) => doc.sheets);
  return {
    cells: sheets.some((sheet) => sheet.cells.length > 0),
    columns: sheets.some((sheet) => sheet.columns.length > 0),
    data: sheets.some((sheet) => sheet.data.length > 0),
    defs: docs.some((doc) => doc.defs.styles.length + doc.defs.values.length > 0),
    formulas: sheets.some((sheet) => sheet.formulas.length > 0),
    merges: sheets.some((sheet) => sheet.merges.length > 0),
    opaque: sheets.some((sheet) => sheet.opaque.length > 0),
    params: docs.some((doc) => doc.params.length > 0),
    rows: sheets.some((sheet) => sheet.rows.length > 0),
  };
}
