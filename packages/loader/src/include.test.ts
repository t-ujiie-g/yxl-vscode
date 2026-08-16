import { CODE as CST_CODE, parse } from '@yxl-vscode/cst';
import { filePath } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import type { IncludeReader } from './ctx';
import { load } from './load';

const MAIN = 'spec.yxl.yaml';

/** The whole filesystem as a mapping, looked up as written: resolving is the shell's. */
function reader(files: Record<string, string>): IncludeReader {
  return (_from, path) => {
    const source = files[path];
    if (source === undefined) return null;

    const file = filePath(path);
    return file === null ? null : { file, source };
  };
}

function read(main: string, files: Record<string, string> = {}) {
  return load(parse(main, { file: MAIN }), reader(files));
}

function codes(main: string, files: Record<string, string> = {}): string[] {
  return read(main, files).diagnostics.map((one) => one.code);
}

describe('an expanded `$include`', () => {
  it('stands for a mapping', () => {
    const { doc, diagnostics } = read(
      'sheets:\n  - name: Sales\n    cells:\n      $include: q3.yaml\n',
      {
        'q3.yaml': 'A1: Region\nB1: 2400000\n',
      },
    );
    expect(diagnostics).toEqual([]);
    expect(doc?.sheets[0]?.cells.map((cell) => cell.at)).toEqual(['A1', 'B1']);
  });

  it('stands for a sequence', () => {
    const { doc } = read('sheets:\n  - name: Sales\n    columns:\n      $include: layout.yaml\n', {
      'layout.yaml': '- at: A\n  width: 18\n- at: B\n  width: 14\n',
    });
    expect(doc?.sheets[0]?.columns.map((band) => band.width)).toEqual([18, 14]);
  });

  it('stands for one item of a sequence', () => {
    const { doc } = read('sheets:\n  - $include: sales.yaml\n  - name: Notes\n', {
      'sales.yaml': 'name: Sales\ncells:\n  A1: Region\n',
    });
    expect(doc?.sheets.map((sheet) => sheet.name)).toEqual(['Sales', 'Notes']);
  });

  it('stands for a whole document', () => {
    const { doc } = read('$include: real.yxl.yaml\n', {
      'real.yxl.yaml': 'sheets:\n  - name: Sales\n',
    });
    expect(doc?.sheets.map((sheet) => sheet.name)).toEqual(['Sales']);
  });

  it('follows through another include', () => {
    const { doc, diagnostics } = read(
      'sheets:\n  - name: S\n    cells:\n      $include: a.yaml\n',
      {
        'a.yaml': '$include: b.yaml\n',
        'b.yaml': 'A1: from b\n',
      },
    );
    expect(diagnostics).toEqual([]);
    expect(doc?.sheets[0]?.cells[0]?.value).toEqual({ kind: 'literal', value: 'from b' });
  });
});

describe('a node read out of an included file', () => {
  const main = 'sheets:\n  - name: Sales\n    cells:\n      $include: q3.yaml\n';
  const included = 'A1: Region\n';

  it('names the file it was written in, not the one that included it', () => {
    const { doc } = read(main, { 'q3.yaml': included });
    expect(doc?.sheets[0]?.cells[0]?.file).toBe('q3.yaml');
    expect(doc?.sheets[0]?.file).toBe(MAIN);
  });

  it('spans the source of that file', () => {
    const { doc } = read(main, { 'q3.yaml': included });
    const span = doc?.sheets[0]?.cells[0]?.span;
    expect(included.slice(span?.start, span?.end)).toBe('A1: Region');
  });

  it('takes its path from that file, so an edit addresses it there', () => {
    const { doc } = read(main, { 'q3.yaml': included });
    expect(doc?.sheets[0]?.cells[0]?.id).toBe('["q3.yaml","A1"]');
  });

  it('reports what it could not read against that file', () => {
    const [diagnostic] = read(main, { 'q3.yaml': 'A0: Region\n' }).diagnostics;
    expect(diagnostic?.code).toBe(CODE.badAddress);
    expect(diagnostic?.file).toBe('q3.yaml');
  });

  it('reports a syntax error in it, which nobody else parsed', () => {
    const [diagnostic] = read(main, { 'q3.yaml': 'A1: Region\n---\nB1: x\n' }).diagnostics;
    expect(diagnostic?.code).toBe(CST_CODE.multipleDocuments);
    expect(diagnostic?.file).toBe('q3.yaml');
  });
});

describe('an `$include` that cannot be followed', () => {
  it('says so when the file cannot be read', () => {
    expect(codes('sheets:\n  $include: missing.yaml\n')).toEqual([CODE.includeUnreadable]);
  });

  it('refuses to be one key among others', () => {
    const main = 'sheets:\n  - name: S\n    cells:\n      $include: q3.yaml\n      A1: x\n';
    expect(codes(main, { 'q3.yaml': 'B1: y\n' })).toEqual([CODE.includeWithSiblings]);
  });

  it('needs a path', () => {
    expect(codes('sheets:\n  $include: 3\n')).toEqual([CODE.badPath]);
  });

  it('says what is missing when the file holds nothing', () => {
    expect(codes('sheets:\n  $include: empty.yaml\n', { 'empty.yaml': '' })).toEqual([
      CODE.includeEmpty,
    ]);
  });

  it('writes out the loop when it comes back round', () => {
    const [diagnostic] = read('sheets:\n  $include: a.yaml\n', {
      'a.yaml': '$include: b.yaml\n',
      'b.yaml': '$include: a.yaml\n',
    }).diagnostics;
    expect(diagnostic?.code).toBe(CODE.includeCycle);
    expect(diagnostic?.message).toContain(`${MAIN} → a.yaml → b.yaml → a.yaml`);
  });

  it('refuses a file that includes itself', () => {
    expect(codes('sheets:\n  $include: a.yaml\n', { 'a.yaml': '$include: a.yaml\n' })).toEqual([
      CODE.includeCycle,
    ]);
  });
});
