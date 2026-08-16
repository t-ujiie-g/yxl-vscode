import type { A1Addr, FilePath } from '@yxl-vscode/units';
import type { SpecNode, Templated } from './node';
import type { ScalarValue } from './value';

/** One entry of a sheet's `data:` sequence: a table anchored at `at`, carrying no formatting. */
export interface DataBlock extends SpecNode {
  readonly at: Templated<A1Addr>;
  readonly source: DataSource;
}

/** Where a block's rows come from — exactly one of these (`docs/spec.md` §9). */
export type DataSource =
  | { readonly kind: 'inline'; readonly rows: readonly DataRow[] }
  | { readonly kind: 'csv'; readonly path: Templated<FilePath> }
  | {
      readonly kind: 'json';
      readonly path: Templated<FilePath>;
      readonly columns: readonly string[] | null;
    };

/** One row of inline fields; a `null` field, like a short row, writes no cell at all. */
export type DataRow = readonly ScalarValue[];
