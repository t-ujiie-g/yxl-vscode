import type { ScalarValue, StyleValues } from '@yxl-vscode/spec';

/**
 * What the host sends the view, and the only thing the view knows about a spec.
 *
 * A projection, flattened for the wire: VS Code serializes a webview message as
 * JSON, so the `Map` and the branded types a `CompiledGrid` holds would not
 * survive the trip. Flattening here rather than in the view keeps every
 * decision about *what a cell looks like* on the side that has the provenance
 * to decide it (ADR-001).
 */
export interface Drawing {
  readonly kind: 'drawing';
  readonly file: string;
  readonly sheets: readonly DrawnSheet[];
  readonly diagnostics: readonly DrawnDiagnostic[];
}

/**
 * One sheet, sized to what it holds.
 *
 * `rows` and `columns` are how far the sheet is drawn: the box its written
 * cells, merges, and filled ranges reach. A spec with three cells draws three
 * cells' worth of grid rather than a million empty ones.
 */
export interface DrawnSheet {
  readonly name: string;
  readonly rows: number;
  readonly columns: number;
  readonly widths: readonly Sized[];
  readonly heights: readonly Sized[];
  readonly cells: readonly DrawnCell[];
  readonly merges: readonly DrawnMerge[];
}

/** A run of columns or rows the spec gave a size, in the spec's own units. */
export interface Sized {
  readonly first: number;
  readonly last: number;
  readonly size: number;
  readonly hidden: boolean;
}

/**
 * One cell as it is drawn: what it holds, what it is called, and how it looks.
 *
 * `value` and `formula` can both be present — a formula with the cached result
 * Excel shows until it recomputes — and neither has been evaluated here
 * (ADR-014).
 */
export interface DrawnCell {
  readonly row: number;
  readonly col: number;
  readonly value: ScalarValue;
  readonly formula: string | null;
  readonly style: StyleValues;
}

export interface DrawnMerge {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

/**
 * Something the projection could not do, as the view lists it.
 *
 * No position: a span is an offset into a file the view does not have, and
 * where a reader wants to *go* to one, VS Code's own Problems panel is already
 * holding it with a line and a column.
 */
export interface DrawnDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly file: string;
}
