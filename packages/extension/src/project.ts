import { type CompiledGrid, compile, type DataReader, type Setting } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import type { Diagnostic } from '@yxl-vscode/diag';
import { type Engine, type Evaluation, evaluate } from '@yxl-vscode/evaluate';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import type { SpecDoc } from '@yxl-vscode/spec';
import type { Drawing } from '@yxl-vscode/webview/protocol';
import { drawn, listed, type Windows } from './drawing';
import { type Nodes, nodesOf } from './inspect';

export type { Window, Windows } from './drawing';

/**
 * A spec, read and drawn — and everything that could not be, said once.
 *
 * The `doc` and the `grid` come back too: the drawing is what the view needs,
 * and a question about *why* a cell looks the way it does is answered from
 * these. Recomputing them per question would be the same work done twice.
 */
export interface Projected {
  readonly drawing: Drawing;
  readonly evaluation: Evaluation | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly doc: SpecDoc | null;
  readonly grid: CompiledGrid | null;
  readonly nodes: Nodes;
}

/**
 * The whole pipeline, as one function over text: parse, load, compile, flatten.
 *
 * Kept apart from anything VS Code so that it is ordinary to test and ordinary
 * to reason about — the host below it only decides *when* to call this and
 * where to put what comes back.
 */
export function project(
  text: string,
  file: string,
  read: IncludeReader & DataReader,
  params: Setting = new Map(),
  windows: Windows = new Map(),
  engine?: Engine,
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

  return { drawing: drawn(file, projected, params, windows), ...projected };
}

/**
 * The same spec drawn at a different part of a sheet.
 *
 * Scrolling changes only which cells the view is handed, so it re-reads and
 * recompiles nothing: that work is what a keystroke costs, and scrolling is not
 * a keystroke.
 */
export function redraw(projected: Projected, params: Setting, windows: Windows): Drawing {
  const { doc, grid } = projected;
  if (doc === null || grid === null) return projected.drawing;

  return drawn(projected.drawing.file, { ...projected, doc, grid }, params, windows);
}
