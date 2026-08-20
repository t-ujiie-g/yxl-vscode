import type { ColumnSpan, RowSpan } from '@yxl-vscode/units';
import type { SpecNode, Templated } from './node';
import type { StyleUse } from './style';

interface BandBase extends SpecNode {
  readonly style: StyleUse | null;
  readonly format: string | null;
  readonly clearsFormat: boolean;
  readonly hidden: boolean | null;
  readonly group: number | null;
}

/**
 * One entry of a sheet's `columns:` sequence, reaching every cell in its span,
 * written or not (`docs/spec.md` §4). `group: 0` is ungrouped, distinct from
 * the key being absent.
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
