import type { A1Addr, FormulaName, ValueName } from '@yxl-vscode/units';
import type { SpecNode, Templated } from './node';
import type { Font, StyleUse } from './style';
import type { ScalarValue } from './value';

/** The types a cell may coerce its value to (`docs/spec.md` §3). */
export const CELL_TYPES = ['text', 'number', 'bool', 'date', 'duration', 'error'] as const;

export type CellType = (typeof CELL_TYPES)[number];

/**
 * What a cell holds, in the six keys of `docs/spec.md` §3, which an override
 * shares. `null` is a key that was absent and `clearsFormat` the `format: null`
 * that says a band supplies none (§6); at least one of the six is present.
 */
export interface CellFacets {
  readonly value: CellValue | null;
  readonly formula: FormulaBody | null;
  readonly rich: readonly RichRun[] | null;
  readonly type: CellType | null;
  readonly format: string | null;
  readonly clearsFormat: boolean;
  readonly style: StyleUse | null;
}

/** One entry of a sheet's `cells:` mapping; `A1: 42` and `A1: { value: 42 }` load the same. */
export interface Cell extends SpecNode, CellFacets {
  readonly at: Templated<A1Addr>;
}

/** A value written where it is used, or the name of a `defs.values` entry. */
export type CellValue =
  | { readonly kind: 'literal'; readonly value: ScalarValue }
  | { readonly kind: 'ref'; readonly name: Templated<ValueName> };

/** A formula written where it is used, or the name of a `defs.formulas` entry; no leading `=`. */
export type FormulaBody =
  | { readonly kind: 'inline'; readonly body: string }
  | { readonly kind: 'ref'; readonly name: Templated<FormulaName> };

/** One run of a rich-text cell: its text, and its font where the run sets one. */
export interface RichRun {
  readonly text: string;
  readonly font: Font | null;
}
