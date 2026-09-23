import { parse } from '@yxl-vscode/cst';
import { reading } from '@yxl-vscode/diag';
import { load } from '@yxl-vscode/loader';
import type { A1Addr, FilePath } from '@yxl-vscode/units';
import { cellAt, compile, styleAt } from './compile';
import type { DataReader } from './ctx';
import type { CompiledCell, CompiledGrid, CompiledSheet } from './grid';
import type { StyleLayer } from './style';
import { WORDS } from './text';

const english = reading('en', WORDS);

// Reading a spec the way this package's tests do; not exported from the index.
const FILE = 'spec.yxl.yaml';

export function grid(source: string, read?: DataReader): CompiledGrid {
  const { doc, diagnostics } = load(parse(source, { file: FILE }));
  if (doc === null) throw new Error(`did not load: ${diagnostics.map((one) => one.code)}`);
  return compile(doc, read === undefined ? {} : { read });
}

export function sheet(source: string, read?: DataReader): CompiledSheet {
  const first = grid(source, read).sheets[0];
  if (first === undefined) throw new Error('compiled no sheet');
  return first;
}

export function cell(source: string, at: string, read?: DataReader): CompiledCell | null {
  return cellAt(sheet(source, read), at as A1Addr);
}

export function layers(source: string, at: string): readonly StyleLayer[] {
  return styleAt(sheet(source), at as A1Addr);
}

/** A spec compiled with parameters set from outside it, as the preview's panel sets them (`docs/spec.md` §7). */
export function given(source: string, params: Record<string, string>): CompiledGrid {
  const { doc } = load(parse(source, { file: FILE }));
  if (doc === null) throw new Error('did not load');
  return compile(doc, { params: new Map(Object.entries(params)) });
}

export function codes(source: string, read?: DataReader): string[] {
  return grid(source, read).diagnostics.map((one) => one.code);
}

/** A reader that holds these files and no others. */
export function files(held: Record<string, string>): DataReader {
  return (_from, path) =>
    held[path] === undefined ? null : { file: path as FilePath, source: held[path] };
}

/** One sheet `S` holding the `layouts:` given, and whatever `rest` adds after it. */
export function laidOut(layouts: string, rest = ''): string {
  return `sheets:\n  - name: S\n    layouts:\n${layouts}${rest}`;
}

/** What compiling said, in English. */
export function said(source: string, read?: DataReader): string[] {
  return grid(source, read).diagnostics.map((one) => english(one.message));
}

/** A cell's formula where it has one, its value otherwise, or `null` where there is no cell. */
export function holds(source: string, at: string, read?: DataReader) {
  const found = cell(source, at, read);
  return found === null ? null : (found.formula ?? found.value);
}
