import { type CompiledGrid, compile, type DataReader, type Setting } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import type { Diagnostic } from '@yxl-vscode/diag';
import { type Engine, type Evaluation, evaluate } from '@yxl-vscode/evaluate';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import type { SpecDoc } from '@yxl-vscode/spec';
import type { Drawing } from '@yxl-vscode/webview/protocol';
import { drawn, listed, type Windows } from './drawing';
import { type Nodes, nodesOf } from './inspect';
import type { PictureReader } from './pictures';

export type { Window, Windows } from './drawing';
export { drawRun, extent } from './drawing';

/** A spec read and drawn, with the `doc` and `grid` the inspector answers from. */
export interface Projected {
  readonly drawing: Drawing;
  readonly evaluation: Evaluation | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly doc: SpecDoc | null;
  readonly grid: CompiledGrid | null;
  readonly nodes: Nodes;
}

/** The whole pipeline as one function over text: parse, load, compile, flatten. */
export function project(
  text: string,
  file: string,
  read: IncludeReader & DataReader,
  params: Setting = new Map(),
  windows: Windows = new Map(),
  engine?: Engine,
  pictures: PictureReader | null = null,
): Projected {
  const parsed = parse(text, { file });
  const loaded = load(parsed, read);
  if (loaded.doc === null) {
    const diagnostics = [...parsed.diagnostics, ...loaded.diagnostics];
    return {
      drawing: {
        kind: 'drawing',
        file,
        sheets: [],
        params: [],
        diagnostics: listed(diagnostics),
        uncomputed: null,
      },
      evaluation: null,
      diagnostics,
      doc: null,
      grid: null,
      nodes: new Map(),
    };
  }

  const grid = compile(loaded.doc, { read, params });
  const diagnostics = [...parsed.diagnostics, ...loaded.diagnostics, ...grid.diagnostics];
  const nodes = nodesOf(loaded.doc);
  const evaluation = engine === undefined ? null : evaluate(grid, engine);
  const projected = { diagnostics, doc: loaded.doc, grid, nodes, evaluation };

  return { drawing: drawn(file, projected, params, windows, pictures), ...projected };
}

/** The same spec drawn at a different part of a sheet, without re-reading or recompiling. */
export function redraw(
  projected: Projected,
  params: Setting,
  windows: Windows,
  pictures: PictureReader | null = null,
): Drawing {
  const { doc, grid } = projected;
  if (doc === null || grid === null) return projected.drawing;

  return drawn(projected.drawing.file, { ...projected, doc, grid }, params, windows, pictures);
}
