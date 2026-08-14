import type { A1Addr, FilePath } from '@yxl-vscode/units';
import type { SpecNode, Templated } from './node';
import type { ScalarValue } from './value';

/**
 * One entry of a sheet's `data:` sequence: a table anchored at `at`, its rows
 * running down and its fields right.
 *
 * A block carries no formatting — that is a `columns:` or `rows:` band's job,
 * and keeping them apart is what lets the data change without the look
 * changing.
 */
export interface DataBlock extends SpecNode {
  readonly at: Templated<A1Addr>;
  readonly source: DataSource;
}

/**
 * Where a block's rows come from: written in the spec, or read from a file
 * beside it. Exactly one, and `columns` names the fields to take from an array
 * of JSON objects, which is the only source whose field order is not its own.
 */
export type DataSource =
  | { readonly kind: 'inline'; readonly rows: readonly DataRow[] }
  | { readonly kind: 'csv'; readonly path: Templated<FilePath> }
  | {
      readonly kind: 'json';
      readonly path: Templated<FilePath>;
      readonly columns: readonly string[] | null;
    };

/**
 * One row of inline fields.
 *
 * A `null` field and a row that stops short both write no cell at all rather
 * than a blank one, which is what lets a `formulas:` range fill the gap.
 */
export type DataRow = readonly ScalarValue[];
