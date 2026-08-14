import type { A1Addr, FormulaName, ValueName } from '@yxl-vscode/units';
import type { SpecNode, Templated } from './node';
import type { Font, StyleUse } from './style';
import type { ScalarValue } from './value';

/** The types a cell may coerce its value to (`docs/spec.md` §3). */
export const CELL_TYPES = ['text', 'number', 'bool', 'date', 'duration', 'error'] as const;

export type CellType = (typeof CELL_TYPES)[number];

/**
 * What a cell holds, in the six keys `docs/spec.md` §3 gives it — and which an
 * `overrides:` entry writes with the same grammar.
 *
 * `null` means the key was absent. At least one of `value`, `formula`, `rich`,
 * `style`, or `format` is present; `value` beside `formula` is the cached
 * result Excel shows until it recomputes, and `style` alone is a blank cell
 * that exists to carry a look.
 */
export interface CellFacets {
  readonly value: CellValue | null;
  readonly formula: FormulaBody | null;
  readonly rich: readonly RichRun[] | null;
  readonly type: CellType | null;
  readonly format: string | null;
  readonly style: StyleUse | null;
}

/**
 * One entry of a sheet's `cells:` mapping, whichever form the spec used —
 * `A1: 42` and `A1: { value: 42 }` load the same, and which one was written is
 * a fact about the syntax that the CST already holds.
 */
export interface Cell extends SpecNode, CellFacets {
  readonly at: Templated<A1Addr>;
}

/** A value written where it is used, or the name of a `defs.values` entry. */
export type CellValue =
  | { readonly kind: 'literal'; readonly value: ScalarValue }
  | { readonly kind: 'ref'; readonly name: Templated<ValueName> };

/**
 * A formula written where it is used, or the name of a `defs.formulas` entry.
 *
 * The body is kept without a leading `=`, which a spec may write and yxl
 * strips.
 */
export type FormulaBody =
  | { readonly kind: 'inline'; readonly body: string }
  | { readonly kind: 'ref'; readonly name: Templated<FormulaName> };

/**
 * One run of a rich-text cell: some text, and the font it is drawn in when the
 * run sets one. A plain string run is a run with no font.
 */
export interface RichRun {
  readonly text: string;
  readonly font: Font | null;
}
