import type { A1Addr, FilePath, NodeId, ParamName } from '@yxl-vscode/units';

/**
 * Where one facet of a cell came from, which is what lets an edit be answered
 * rather than guessed at (ADR-005). `node` is what a patch would address, and a
 * row and column count from the block's own corner.
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
      readonly declared: readonly NodeId[];
    }
  | { readonly kind: 'override'; readonly node: NodeId }
  | { readonly kind: 'empty'; readonly node: NodeId | null };

/** Where a cell's facets came from, each separately; `format` is `null` where nothing set one. */
export interface CellProvenance {
  readonly value: FacetOrigin;
  readonly format: FacetOrigin | null;
}
