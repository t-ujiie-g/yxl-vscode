import type { A1Addr, A1Range, Color, SheetName } from '@yxl-vscode/units';
import type { ColumnBand, RowBand } from './band';
import type { Cell } from './cell';
import type { Conditional } from './conditional';
import type { DataBlock } from './data';
import type { Opaque, SpecNode, Templated } from './node';

/** A sheet's splitter, in points from the top-left; `0` on an axis leaves it unsplit (`docs/spec.md` §2). */
export interface Split {
  readonly x: number;
  readonly y: number;
}

/** Whether Excel shows a sheet's tab; `very_hidden` is undone only from VBA (`docs/spec.md` §2). */
export type Visibility = 'visible' | 'hidden' | 'very_hidden';

/**
 * One sheet. `keyOrder` is the sheet's keys as written, because where two
 * constructs write one cell the later key wins (`docs/spec.md` §2).
 */
export interface Sheet extends SpecNode {
  readonly name: Templated<SheetName>;
  readonly cells: readonly Cell[];
  readonly formulas: readonly FormulaRange[];
  readonly data: readonly DataBlock[];
  readonly columns: readonly ColumnBand[];
  readonly rows: readonly RowBand[];
  readonly merges: readonly Merge[];
  readonly freeze: Templated<A1Addr> | null;
  readonly visibility: Visibility | null;
  readonly tabColor: Templated<Color> | null;
  readonly gridlines: boolean | null;
  readonly split: Split | null;
  readonly conditional: readonly Conditional[];
  readonly keyOrder: readonly string[];
  readonly opaque: readonly Opaque[];
}

/**
 * One formula filled across a region, written as it applies at the top-left
 * cell and shifted into every other (`docs/spec.md` §3). No leading `=`, and
 * never a `$ref`.
 */
export interface FormulaRange extends SpecNode {
  readonly at: Templated<A1Range>;
  readonly formula: string;
}

/** One merged region; Excel shows the top-left cell's value across it. */
export interface Merge extends SpecNode {
  readonly at: Templated<A1Range>;
}
