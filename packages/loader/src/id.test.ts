import { parse } from '@yxl-vscode/cst';
import type { SpecDoc } from '@yxl-vscode/spec';
import { type FilePath, filePath } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { nodeIdAt } from './id';
import { load } from './load';

function file(name: string): FilePath {
  const branded = filePath(name);
  if (branded === null) throw new Error(`not a path: ${name}`);
  return branded;
}

const FILE = file('spec.yxl.yaml');
const OTHER = file('cells.yaml');

describe('nodeIdAt', () => {
  it('names the root of a file', () => {
    expect(nodeIdAt(FILE, [])).toBe('["spec.yxl.yaml"]');
  });

  it('spells out the steps that reach the node', () => {
    expect(nodeIdAt(FILE, ['sheets', 0, 'cells', 'A1'])).toBe(
      '["spec.yxl.yaml","sheets",0,"cells","A1"]',
    );
  });

  it('keeps the same path in two files apart', () => {
    // `$include` makes two files one document, and the first sheet of each is
    // `sheets/0` in its own.
    expect(nodeIdAt(FILE, ['sheets', 0])).not.toBe(nodeIdAt(OTHER, ['sheets', 0]));
  });

  it('keeps two nodes apart when a step holds the separator', () => {
    // A style may be named anything, `a","b` included; a joined path would make
    // these two the same node.
    expect(nodeIdAt(FILE, ['defs', 'styles', 'a","b'])).not.toBe(
      nodeIdAt(FILE, ['defs', 'styles', 'a', 'b']),
    );
  });

  it('tells an index from the text of one', () => {
    expect(nodeIdAt(FILE, ['sheets', 0])).not.toBe(nodeIdAt(FILE, ['sheets', '0']));
  });
});

function idsOf(source: string): string[] {
  const { doc } = load(parse(source, { file: 'spec.yxl.yaml' }));
  return doc === null ? [] : everyNode(doc).map((node) => node.id);
}

function everyNode(doc: SpecDoc): { id: string }[] {
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
  return [doc, ...inSheets, ...declared, ...doc.overrides, ...doc.opaque];
}

const BANDS = 'sheets:\n  - name: Sales\n    columns:\n      - at: B\n      - at: D\n';

function bandId(source: string, at: string): string | undefined {
  const { doc } = load(parse(source, { file: 'spec.yxl.yaml' }));
  return doc?.sheets[0]?.columns.find((band) => band.at === at)?.id;
}

describe('identity across two reads', () => {
  it('re-derives the same ids from the same source', () => {
    // What ADR-015 buys by deriving rather than persisting: nothing has to be
    // written into the spec for a node to be found again.
    expect(idsOf(BANDS)).toEqual(idsOf(BANDS));
  });

  it('holds a mapping key steady when a sibling is added before it', () => {
    const before = 'sheets:\n  - name: Sales\n    cells:\n      B2: two\n';
    const after = 'sheets:\n  - name: Sales\n    cells:\n      A1: one\n      B2: two\n';
    expect(idsOf(after)).toContain(idsOf(before).at(-1));
  });

  it('gives a sequence item a new id when one is inserted before it', () => {
    // The weakness ADR-015's identity map exists to cover, pinned so that the
    // day it is covered, this test is what changes. Until a caller holds an id
    // across an edit — the preview does not — nothing is hurt by it
    // (ADR-023). Note the id itself is not free either: it stays a valid id and
    // starts naming the band next door.
    const inserted =
      'sheets:\n  - name: Sales\n    columns:\n      - at: A\n      - at: B\n      - at: D\n';
    expect(bandId(inserted, 'D')).not.toBe(bandId(BANDS, 'D'));
    expect(bandId(inserted, 'B')).toBe(bandId(BANDS, 'D'));
  });
});
