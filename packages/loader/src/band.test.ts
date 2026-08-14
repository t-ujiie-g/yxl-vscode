import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function loaded(body: string) {
  return load(parse(`sheets:\n  - name: Sales\n${body}`, { file: 'spec.yxl.yaml' }));
}

function codes(body: string): string[] {
  return loaded(body).diagnostics.map((diagnostic) => diagnostic.code);
}

function columns(body: string) {
  return loaded(`    columns:\n${body}`).doc?.sheets[0]?.columns ?? [];
}

function rows(body: string) {
  return loaded(`    rows:\n${body}`).doc?.sheets[0]?.rows ?? [];
}

describe('a column band', () => {
  it('reads what it sets, over the columns it selects', () => {
    const [band] = columns('      - at: B\n        width: 18\n        format: "#,##0"\n');
    expect(band?.at).toBe('B');
    expect(band?.width).toBe(18);
    expect(band?.format).toBe('#,##0');
  });

  it('selects a range of columns', () => {
    expect(columns('      - at: D-F\n        group: 1\n        hidden: true\n')[0]).toMatchObject({
      at: 'D-F',
      group: 1,
      hidden: true,
    });
  });

  it('sets nothing when it says nothing, and is still a band', () => {
    const [band] = columns('      - at: B\n');
    expect([band?.width, band?.style, band?.format, band?.hidden, band?.group]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('refuses a selector that runs backwards', () => {
    expect(codes('    columns:\n      - at: F-D\n')).toEqual([CODE.badColumn]);
  });

  it('refuses a row number where a column label belongs', () => {
    expect(codes('    columns:\n      - at: 1\n')).toEqual([CODE.badColumn]);
  });

  it('has no `height`, which belongs to a row', () => {
    expect(codes('    columns:\n      - at: B\n        height: 28\n')).toEqual([CODE.unknownKey]);
  });
});

describe('a row band', () => {
  it('reads a selector written as a number', () => {
    const [band] = rows('      - at: 1\n        height: 28\n');
    expect(band?.at).toBe('1');
    expect(band?.height).toBe(28);
  });

  it('reads a range of rows', () => {
    expect(rows('      - at: 2-4\n')[0]?.at).toBe('2-4');
  });

  it('refuses a selector that runs backwards', () => {
    expect(codes('    rows:\n      - at: 4-2\n')).toEqual([CODE.badRow]);
  });

  it('has no `width`, which belongs to a column', () => {
    expect(codes('    rows:\n      - at: 1\n        width: 18\n')).toEqual([CODE.unknownKey]);
  });
});

describe('a band', () => {
  it('needs an `at`', () => {
    expect(codes('    columns:\n      - width: 18\n')).toEqual([CODE.missingKey]);
  });

  it('takes a style by name or written out', () => {
    expect(columns('      - at: B\n        style: header\n')[0]?.style).toEqual({
      kind: 'ref',
      name: 'header',
    });
    expect(
      columns('      - at: B\n        style: { font: { bold: true } }\n')[0]?.style?.kind,
    ).toBe('inline');
  });

  it('keeps a selector a parameter fills in', () => {
    expect(columns('      - at: "${col}"\n')[0]?.at).toEqual({ kind: 'template', text: '${col}' });
  });

  it('is identified by its position in the sequence', () => {
    expect(columns('      - at: B\n      - at: D\n')[1]?.id).toBe('["sheets",0,"columns",1]');
  });
});
