import type { Diagnostic } from '@yxl-vscode/diag';
import type { CellType, ScalarValue, StyleValues } from '@yxl-vscode/spec';
import type { A1Addr, NodeId, Rect, SheetName } from '@yxl-vscode/units';
import type { CellProvenance } from './provenance';
import type { StyleLayer } from './style';

/**
 * The workbook as the grid draws it: the projection, computed forward from the
 * spec and holding no state of its own (ADR-001).
 *
 * Nothing here is ever edited. A gesture on the grid becomes an edit to the
 * spec, and the grid is computed again — which is why every part of this
 * carries the `NodeId` of whatever produced it.
 */
export interface CompiledGrid {
  readonly sheets: readonly CompiledSheet[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * One sheet.
 *
 * `cells`, `fills`, and the bands are all sparse for the same reason: a spec
 * says `at: D2:D500` in two words and a band reaches its whole span, so drawing
 * any of them out would turn a small file into a large grid. `cellAt` is how a
 * consumer asks about one address without knowing which of them holds it.
 */
export interface CompiledSheet {
  readonly name: SheetName;
  readonly node: NodeId;
  readonly cells: ReadonlyMap<string, CompiledCell>;
  readonly fills: readonly CompiledFill[];
  readonly columns: readonly CompiledBand[];
  readonly rows: readonly CompiledBand[];
  readonly merges: readonly CompiledMerge[];
}

/**
 * One `formulas:` range, kept as a range.
 *
 * Multiplying it out is what the construct exists to avoid: `D2:D1048576` is
 * two words in a spec, one stored formula in the workbook, and would be a
 * million cells here. `cellAt` answers for the cells it covers, so a consumer
 * never has to know which of the two holds the one it asked about.
 */
export interface CompiledFill {
  readonly rect: Rect;
  readonly anchor: A1Addr;
  readonly formula: string;
  readonly node: NodeId;
}

/**
 * One cell, with where each of its facets came from.
 *
 * `value` is what the cell holds after parameters are substituted and a `$ref`
 * is followed; `formula` is the body Excel would compute, without its `=`. A
 * cell can hold both: a formula with the cached value Excel shows until it
 * recomputes.
 *
 * `style` is what *this cell* contributed to how it looks. What a band over it
 * contributes is the band's, so how the cell finally looks is `styleAt` — an
 * address has a look whether a cell was written there or not.
 */
/**
 * One run of a `rich:` cell: a piece of its text, and the look that piece alone
 * wears (`docs/spec.md` §3).
 *
 * A run's font is a look in its own right rather than a layer over the cell's:
 * Excel keeps it on the string, and nothing else in the workbook can reach it.
 */
export interface CompiledRun {
  readonly text: string;
  readonly look: StyleValues;
}

export interface CompiledCell {
  readonly at: A1Addr;
  readonly value: ScalarValue;
  readonly type: CellType | null;
  readonly formula: string | null;
  readonly format: string | null;
  readonly rich: readonly CompiledRun[] | null;
  readonly style: readonly StyleLayer[];
  readonly provenance: CellProvenance;
}

/**
 * One band of columns or rows, as geometry.
 *
 * `size` is a width in character units or a height in points, whichever axis
 * this is; `null` leaves Excel's default. `style` is what the band contributes
 * to every cell in its span, written or not (`docs/spec.md` §4).
 */
export interface CompiledBand {
  readonly first: number;
  readonly last: number;
  readonly size: number | null;
  readonly hidden: boolean | null;
  readonly group: number | null;
  readonly style: readonly StyleLayer[];
  readonly node: NodeId;
}

/** One merged region; the grid shows the top-left cell's value across it. */
export interface CompiledMerge {
  readonly rect: Rect;
  readonly node: NodeId;
}
