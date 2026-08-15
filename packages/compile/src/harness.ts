import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import type { A1Addr } from '@yxl-vscode/units';
import { cellAt, compile, styleAt } from './compile';
import type { DataReader } from './ctx';
import type { CompiledCell, CompiledGrid, CompiledSheet } from './grid';
import type { StyleLayer } from './style';

/**
 * Reading a spec the way this package's tests do: parse, load, compile.
 *
 * Here rather than in each test file because four of them wanted the same five
 * lines, and not in the package's index because nothing outside the tests
 * should reach for it — a caller with a `SpecDoc` calls `compile`, and a caller
 * without one has a loader of its own.
 */
const FILE = 'spec.yxl.yaml';

export function grid(source: string, read?: DataReader): CompiledGrid {
  const { doc, diagnostics } = load(parse(source, { file: FILE }));
  if (doc === null) throw new Error(`did not load: ${diagnostics.map((one) => one.code)}`);
  return compile(doc, read);
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

export function codes(source: string, read?: DataReader): string[] {
  return grid(source, read).diagnostics.map((one) => one.code);
}
