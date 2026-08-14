import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

const FILE = 'spec.yxl.yaml';

function read(source: string) {
  return load(parse(source, { file: FILE }));
}

function codes(source: string): string[] {
  return read(source).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('load', () => {
  it('reads the sheets, in tab order', () => {
    const { doc } = read('sheets:\n  - name: Sales\n  - name: Notes\n');
    expect(doc?.sheets.map((s) => s.name)).toEqual(['Sales', 'Notes']);
  });

  it('reads nothing from an empty file', () => {
    expect(read('')).toEqual({ doc: null, diagnostics: [] });
  });

  it('refuses a root that is not a mapping', () => {
    expect(codes('- a\n- b\n')).toEqual([CODE.notAMapping]);
  });

  it('needs a named file to read from', () => {
    const loaded = load(parse('sheets: []', { file: '' }));
    expect(loaded.doc).toBeNull();
    expect(loaded.diagnostics.map((d) => d.code)).toEqual([CODE.unnamedFile]);
  });

  it('names the file every node was written in', () => {
    const { doc } = read('sheets:\n  - name: Sales\n');
    expect(doc?.file).toBe(FILE);
    expect(doc?.sheets[0]?.file).toBe(FILE);
  });

  it('spans a node over the source that produced it', () => {
    const source = 'sheets:\n  - name: Sales\n';
    const { doc } = read(source);
    const span = doc?.sheets[0]?.span;
    expect(source.slice(span?.start, span?.end)).toBe('name: Sales');
  });

  it('gives every node an identity derived from its path', () => {
    const { doc } = sheetWithCell();
    expect(doc?.id).toBe('[]');
    expect(doc?.sheets[0]?.id).toBe('["sheets",0]');
    expect(doc?.sheets[0]?.cells[0]?.id).toBe('["sheets",0,"cells","A1"]');
  });

  it('carries a top-level key it does not model, rather than dropping it', () => {
    const { doc } = read('sheets: []\nactive: Sales\ndate1904: true\n');
    expect(doc?.opaque.map((o) => o.key)).toEqual(['active', 'date1904']);
    expect(doc?.opaque[0]?.id).toBe('["active"]');
  });

  it('reads params, keeping a default that names another parameter as written', () => {
    const { doc } = read('sheets: []\nparams:\n  region: APAC\n  title: "${quarter} ${region}"\n');
    expect(doc?.params.map((p) => [p.name, p.value])).toEqual([
      ['region', 'APAC'],
      ['title', '${quarter} ${region}'],
    ]);
  });

  it('reports a key written twice and keeps the first', () => {
    const loaded = read('sheets:\n  - name: Sales\nsheets:\n  - name: Notes\n');
    expect(loaded.doc?.sheets.map((s) => s.name)).toEqual(['Sales']);
    expect(loaded.diagnostics.map((d) => d.code)).toEqual([CODE.duplicateKey]);
  });

  it('says an `$include` is not expanded rather than reading it as what it replaced', () => {
    expect(codes('$include: other.yaml\n')).toEqual([CODE.includeNotExpanded]);
    expect(codes('sheets:\n  - name: Sales\n    cells:\n      $include: cells.yaml\n')).toEqual([
      CODE.includeNotExpanded,
    ]);
  });

  it('keeps reading after something it could not read', () => {
    const loaded = read('sheets:\n  - name: Sales\n    cells:\n      nonsense: 1\n      B2: 7\n');
    expect(loaded.diagnostics.map((d) => d.code)).toEqual([CODE.badAddress]);
    expect(loaded.doc?.sheets[0]?.cells.map((c) => c.at)).toEqual(['B2']);
  });
});

describe('defs', () => {
  it('reads the three namespaces separately', () => {
    const { doc } = read(
      'sheets: []\ndefs:\n  styles:\n    header: { font: { bold: true } }\n  values:\n    tax_rate: 0.085\n  formulas:\n    subtotal: "=SUM(B2:B10)"\n',
    );
    expect(doc?.defs.styles.map((d) => d.name)).toEqual(['header']);
    expect(doc?.defs.values.map((d) => [d.name, d.value])).toEqual([['tax_rate', 0.085]]);
    expect(doc?.defs.formulas.map((d) => [d.name, d.body])).toEqual([['subtotal', 'SUM(B2:B10)']]);
  });

  it('has no definitions when the spec declares none', () => {
    const { doc } = read('sheets: []\n');
    expect(doc?.defs).toEqual({ styles: [], values: [], formulas: [] });
  });

  it('reports a `defs` key that is not one of the three', () => {
    expect(codes('sheets: []\ndefs:\n  colours:\n    red: FF0000\n')).toEqual([CODE.unknownKey]);
  });

  it('spans a definition over its whole entry, so a rename can reach the key', () => {
    const source = 'sheets: []\ndefs:\n  values:\n    tax_rate: 0.085\n';
    const { doc } = read(source);
    const span = doc?.defs.values[0]?.span;
    expect(source.slice(span?.start, span?.end)).toBe('tax_rate: 0.085');
  });
});

function sheetWithCell() {
  return read('sheets:\n  - name: Sales\n    cells:\n      A1: Region\n');
}
