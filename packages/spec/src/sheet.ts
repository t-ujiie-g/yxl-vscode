import type { A1Addr, A1Range, Color, SheetName } from '@yxl-vscode/units';
import type { ColumnBand, RowBand } from './band';
import type { Cell } from './cell';
import type { Conditional } from './conditional';
import type { DataBlock } from './data';
import type { Chart, Image, Shape } from './float';
import type { Opaque, SpecNode, Templated } from './node';
import type { Print, Protect } from './print';
import type { SparklineGroup } from './sparkline';
import type { Validation } from './validation';

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
  readonly filter: Templated<A1Range> | null;
  readonly print: Print | null;
  readonly protect: Protect | null;
  readonly comments: readonly Note[];
  readonly links: readonly Link[];
  readonly validations: readonly Validation[];
  readonly tables: readonly Table[];
  readonly charts: readonly Chart[];
  readonly images: readonly Image[];
  readonly shapes: readonly Shape[];
  readonly sparklines: readonly SparklineGroup[];
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

/**
 * One note on a cell, which Excel shows on hover and keeps beside the value
 * rather than in place of it (`docs/spec.md` §10). A note in the file always
 * carries an author, so `null` leaves Excel to write its generic one.
 */
export interface Note extends SpecNode {
  readonly at: Templated<A1Addr>;
  readonly text: string;
  readonly author: string | null;
}

/**
 * One link on a cell, which decorates it as a note does: the cell shows its own
 * value still. Which kind of target it is, is written rather than inferred —
 * `Summary!A1` and a URL are both just text (`docs/spec.md` §10).
 */
export interface Link extends SpecNode {
  readonly at: Templated<A1Addr>;
  readonly target: LinkTarget;
  readonly tip: string | null;
}

/** Where a link goes: `url` out of the workbook, `to` a cell or a defined name in it. */
export interface LinkTarget {
  readonly kind: 'url' | 'to';
  readonly text: string;
}

/**
 * One `tables:` entry: a region declared to *be* an Excel table, whose top row
 * names its columns (`docs/spec.md` §11). The four flags are Excel's Table
 * Design toggles, `bandedRows` alone defaulting to on.
 */
export interface Table extends SpecNode {
  readonly at: Templated<A1Range>;
  readonly name: string | null;
  readonly style: string | null;
  readonly bandedRows: boolean;
  readonly bandedColumns: boolean;
  readonly firstColumn: boolean;
  readonly lastColumn: boolean;
}

/** One merged region; Excel shows the top-left cell's value across it. */
export interface Merge extends SpecNode {
  readonly at: Templated<A1Range>;
}
