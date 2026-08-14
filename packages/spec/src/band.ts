import type { ColumnSpan, RowSpan } from '@yxl-vscode/units';
import type { SpecNode, Templated } from './node';
import type { StyleUse } from './style';

interface BandBase extends SpecNode {
  readonly style: StyleUse | null;
  readonly format: string | null;
  readonly hidden: boolean | null;
  readonly group: number | null;
}

/**
 * One entry of a sheet's `columns:` sequence: what it sets, over the columns
 * `at` selects.
 *
 * A band reaches every cell in its span, written or not, which is what makes it
 * the place to style a region a `data:` block or a `formulas:` range fills —
 * neither of those carries formatting of its own. `group` is an outline level,
 * where `0` means ungrouped and is distinct from the key being absent.
 */
export interface ColumnBand extends BandBase {
  readonly at: Templated<ColumnSpan>;
  readonly width: number | null;
}

/** The same, over rows, sized in points rather than character units. */
export interface RowBand extends BandBase {
  readonly at: Templated<RowSpan>;
  readonly height: number | null;
}
