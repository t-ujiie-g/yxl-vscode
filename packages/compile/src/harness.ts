import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import type { A1Addr } from '@yxl-vscode/units';
import { cellAt, compile, styleAt } from './compile';
import type { DataReader } from './ctx';
import type { CompiledCell, CompiledGrid, CompiledSheet } from './grid';
import type { StyleLayer } from './style';

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
