import type { Diagnostic } from '@yxl-vscode/diag';
import type { CellType, ScalarValue, StyleValues } from '@yxl-vscode/spec';
import type { A1Addr, NodeId, Rect, SheetName } from '@yxl-vscode/units';
import type { CellProvenance } from './provenance';
import type { StyleLayer } from './style';

/**
 * The workbook as the grid draws it: a projection computed forward from the
 * spec, never edited (ADR-001). Every part carries the `NodeId` that produced
 * it.
 */
export interface CompiledGrid {
  readonly sheets: readonly CompiledSheet[];
  readonly diagnostics: readonly Diagnostic[];
}

/** One sheet, held sparse: `cellAt` answers for an address whichever construct holds it. */
export interface CompiledSheet {
  readonly name: SheetName;
  readonly node: NodeId;
  readonly cells: ReadonlyMap<string, CompiledCell>;
  readonly fills: readonly CompiledFill[];
  readonly columns: readonly CompiledBand[];
  readonly rows: readonly CompiledBand[];
  readonly merges: readonly CompiledMerge[];
}

/** One `formulas:` range, kept as a range: `D2:D1048576` is two words, not a million cells (ADR-019). */
export interface CompiledFill {
  readonly rect: Rect;
  readonly anchor: A1Addr;
  readonly formula: string;
  readonly node: NodeId;
}

/** One run of a `rich:` cell: a piece of its text and the look that piece alone wears (`docs/spec.md` §3). */
export interface CompiledRun {
  readonly text: string;
  readonly look: StyleValues;
}

/**
 * One cell, with where each facet came from. `value` is after substitution and
 * `$ref`; `formula` is the body without `=`, and a cell may hold both. `style`
 * is what this cell contributed; how it finally looks is `styleAt`.
 */
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
 * One band of columns or rows. `size` is a width in character units or a height
 * in points; `null` leaves Excel's default (`docs/spec.md` §4).
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
