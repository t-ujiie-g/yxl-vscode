import type { A1Addr, FilePath, NodeId, ParamName } from '@yxl-vscode/units';

/**
 * Where one facet of a cell came from (`ROADMAP.md` §4.3).
 *
 * This is what makes the editor able to answer an edit rather than guess at it:
 * a value the spec typed at the cell is one thing to change, and the same value
 * arriving from a definition, a parameter, or row 12 of a CSV is another. The
 * `node` is always what a patch would address. A position on an `inline` or an
 * `external` origin counts from that block's own corner, from zero.
 */
export type FacetOrigin =
  | { readonly kind: 'literal'; readonly node: NodeId }
  | { readonly kind: 'inline'; readonly node: NodeId; readonly row: number; readonly col: number }
  | {
      readonly kind: 'external';
      readonly node: NodeId;
      readonly file: FilePath;
      readonly row: number;
      readonly col: number;
    }
  | {
      readonly kind: 'formulaRange';
      readonly node: NodeId;
      readonly anchor: A1Addr;
      readonly offset: readonly [number, number];
    }
  | { readonly kind: 'defRef'; readonly node: NodeId; readonly def: NodeId }
  | {
      readonly kind: 'param';
      readonly node: NodeId;
      readonly template: string;
      readonly params: readonly ParamName[];
    }
  | { readonly kind: 'override'; readonly node: NodeId }
  | { readonly kind: 'empty' };

/**
 * Where a cell's facets came from, each answered separately.
 *
 * Per-facet because the common case is mixed: a value from a CSV wearing a
 * number format from a band. `format` is `null` when nothing set one — which is
 * not the same as `empty`, the origin of a cell that exists and holds nothing.
 *
 * The address is not repeated here; the cell that carries this knows it.
 */
export interface CellProvenance {
  readonly value: FacetOrigin;
  readonly format: FacetOrigin | null;
}
