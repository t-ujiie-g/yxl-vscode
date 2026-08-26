import type { DataReader } from '@yxl-vscode/compile';
import type { IncludeReader } from '@yxl-vscode/loader';
import { type FilePath, filePath } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { besideSpec, openFirst } from './files';

const AT = (path: string): FilePath => filePath(path) ?? ('' as FilePath);

/** A reader over a fixed set of files, standing in for the disk. */
const disk =
  (files: Record<string, string>): IncludeReader & DataReader =>
  (_from, path) =>
    files[path] === undefined ? null : { file: path, source: files[path] };

describe('reading a spec the reader is in the middle of editing', () => {
  it('answers with what the editor holds, where it holds anything', () => {
    const read = openFirst(disk({ 'defs.yaml': 'values:\n  rate: 1\n' }), (file) =>
      file === AT('defs.yaml') ? 'values:\n  rate: 2\n' : null,
    );

    expect(read(AT('spec.yxl.yaml'), AT('defs.yaml'))?.source).toContain('rate: 2');
  });

  it('falls back to the file itself, where nothing is open on it', () => {
    const read = openFirst(disk({ 'defs.yaml': 'values:\n  rate: 1\n' }), () => null);
    expect(read(AT('spec.yxl.yaml'), AT('defs.yaml'))?.source).toContain('rate: 1');
  });

  it('says nothing about a path that resolves to no file at all', () => {
    // An unsaved buffer for a file that is not there is not a file the spec can
    // read: the path has to resolve before there is anything to answer about.
    const read = openFirst(disk({}), () => 'values:\n  rate: 2\n');
    expect(read(AT('spec.yxl.yaml'), AT('nowhere.yaml'))).toBeNull();
  });

  it('keeps the path the file resolved to, not the one the spec wrote', () => {
    const read = openFirst(disk({ 'sheets/sales.yaml': 'name: Sales\n' }), () => null);
    expect(read(AT('spec.yxl.yaml'), AT('sheets/sales.yaml'))?.file).toBe(AT('sheets/sales.yaml'));
  });
});

describe('a picked file written beside the spec', () => {
  it('is relative to the spec it goes in', () => {
    expect(besideSpec('/specs/report.yxl.yaml', '/specs/assets/logo.png')).toBe('assets/logo.png');
  });

  it('says so where it sits above the spec, since a `data:` path may too', () => {
    expect(besideSpec('/specs/here/report.yxl.yaml', '/specs/logo.png')).toBe('../logo.png');
  });
});
