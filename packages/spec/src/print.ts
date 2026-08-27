import type { A1Addr, A1Range } from '@yxl-vscode/units';
import type { SpecNode, Templated } from './node';

/** Which way round the paper goes (`docs/spec.md` §5). */
export const ORIENTATIONS = ['portrait', 'landscape'] as const;

export type Orientation = (typeof ORIENTATIONS)[number];

/** The page margins, in the inches Excel measures them in; unset leaves Excel's own (`docs/spec.md` §5). */
export interface Margins {
  readonly top: number | null;
  readonly bottom: number | null;
  readonly left: number | null;
  readonly right: number | null;
  readonly header: number | null;
  readonly footer: number | null;
}

/** How many pages across and down the sheet is squeezed into; `0` leaves that axis alone. */
export interface Fit {
  readonly width: number | null;
  readonly height: number | null;
}

/**
 * One sheet's `print:` setup. `scale` and `fit` are the two halves of Excel's
 * scaling control and cannot be combined; `header` and `footer` are Excel's own
 * `&`-code syntax (`docs/spec.md` §5).
 */
export interface Print extends SpecNode {
  readonly area: Templated<A1Range> | null;
  readonly orientation: Templated<Orientation> | null;
  readonly margins: Margins | null;
  readonly scale: number | null;
  readonly fit: Fit | null;
  readonly header: Templated<string> | null;
  readonly footer: Templated<string> | null;
  readonly breaks: readonly Templated<A1Addr>[];
}

/**
 * What a reader may still do on a protected sheet. Anything unnamed keeps
 * Excel's default, which is selection allowed and everything else blocked
 * (`docs/spec.md` §16).
 */
export const ALLOWANCES = [
  'select_locked_cells',
  'select_unlocked_cells',
  'format_cells',
  'format_columns',
  'format_rows',
  'insert_columns',
  'insert_rows',
  'insert_hyperlinks',
  'delete_columns',
  'delete_rows',
  'sort',
  'auto_filter',
  'pivot_tables',
  'edit_objects',
  'edit_scenarios',
] as const;

export type Allowance = (typeof ALLOWANCES)[number];

/**
 * One sheet's `protect:`. Excel locks every cell by default, so what a spec
 * says about a *cell* is the exception: a style with `protection: { locked:
 * false }` is what makes a form fillable (`docs/spec.md` §16).
 */
export interface Protect extends SpecNode {
  readonly password: Templated<string> | null;
  readonly allow: { readonly [K in Allowance]?: boolean };
}
