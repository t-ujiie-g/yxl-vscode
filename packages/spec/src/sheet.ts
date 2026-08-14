import type { A1Range, SheetName } from '@yxl-vscode/units';
import type { ColumnBand, RowBand } from './band';
import type { Cell } from './cell';
import type { DataBlock } from './data';
import type { Opaque, SpecNode, Templated } from './node';

/**
 * One sheet of the workbook.
 *
 * `keyOrder` names the sheet's keys in the order the spec wrote them, opaque
 * ones included: where a `data:` block and a `cells:` entry write the same
 * cell, whichever key came later wins (`docs/spec.md` §2), and nothing else
 * here records that. Anything this editor does not model is in `opaque` rather
 * than dropped (ADR-011).
 */
export interface Sheet extends SpecNode {
  readonly name: Templated<SheetName>;
  readonly cells: readonly Cell[];
  readonly formulas: readonly FormulaRange[];
  readonly data: readonly DataBlock[];
  readonly columns: readonly ColumnBand[];
  readonly rows: readonly RowBand[];
  readonly merges: readonly Merge[];
  readonly keyOrder: readonly string[];
  readonly opaque: readonly Opaque[];
}

/**
 * One formula filled across a region: written as it applies at the range's
 * top-left cell, and shifted into every other cell by that cell's offset.
 *
 * The body is kept without a leading `=`. A `{ $ref: }` cannot stand here — a
 * defined name gives every cell the *same* formula, which is the opposite of
 * filling a range (`docs/spec.md` §3).
 */
export interface FormulaRange extends SpecNode {
  readonly at: Templated<A1Range>;
  readonly formula: string;
}

/** One merged region; Excel shows the top-left cell's value across it. */
export interface Merge extends SpecNode {
  readonly at: Templated<A1Range>;
}
