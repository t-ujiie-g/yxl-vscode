import type { Computed } from '@yxl-vscode/evaluate';
import type { ScalarValue, StyleValues } from '@yxl-vscode/spec';

/**
 * What the host sends the view, and all the view knows of a spec: a projection
 * flattened for JSON, with every decision about how a cell looks made on the
 * side that has the provenance (ADR-001). `uncomputed` says why some cells show
 * a formula rather than a result.
 */
export interface Drawing {
  readonly kind: 'drawing';
  readonly file: string;
  readonly sheets: readonly DrawnSheet[];
  readonly params: readonly DrawnParam[];
  readonly diagnostics: readonly DrawnDiagnostic[];
  readonly uncomputed: Uncomputed | null;
}

/**
 * Why a formula shows as a formula: `names` the preview cannot compute from, or
 * a workbook with `tooMany` formulas, where nothing is computed rather than part.
 */
export type Uncomputed =
  | { readonly kind: 'names'; readonly names: readonly string[] }
  | { readonly kind: 'tooMany'; readonly limit: number };

/** One declared parameter; `set` where the reader gave it a value here rather than the default (`docs/spec.md` §7). */
export interface DrawnParam {
  readonly name: string;
  readonly value: string;
  readonly set: boolean;
}

/**
 * One sheet: the window drawn (`at`, `rows`, `columns`) out of how far the
 * sheet reaches (`of`), so the grid never holds more than a page however large
 * the sheet.
 */
export interface DrawnSheet {
  readonly name: string;
  readonly rows: number;
  readonly columns: number;
  readonly at: { readonly row: number; readonly col: number };
  readonly of: { readonly rows: number; readonly columns: number };
  readonly widths: readonly Sized[];
  readonly heights: readonly Sized[];
  readonly cells: readonly DrawnCell[];
  readonly merges: readonly DrawnMerge[];
  readonly problems: readonly MarkedCell[];
}

/** A diagnostic on the cell it is about; one that reaches no cell stays in the list under the grid. */
export interface MarkedCell {
  readonly row: number;
  readonly col: number;
  readonly message: string;
}

/** Whether a cell can be typed into: one node says it, several could, or a file beside the spec does. */
export type Editable = 'direct' | 'mediated' | 'external';

/** One run of a `rich:` cell: a piece of its text, and the look that piece wears. */
export interface DrawnRun {
  readonly text: string;
  readonly style: StyleValues;
}

/** A run of columns or rows a band declares; `size` in the spec's units, `null` where it set none. */
export interface Sized {
  readonly first: number;
  readonly last: number;
  readonly size: number | null;
  readonly hidden: boolean;
}

/**
 * One cell as it is drawn. `value` and `formula` are what the spec holds and
 * `computed` is separate on purpose (ADR-014). `format` is the one that applies
 * here — an inherited format does not reach a text cell (`docs/spec.md` §4).
 * `filledFrom` is the anchor of the range a cell belongs to, whose `formula` is
 * written as it applies there. `overridden` marks an `overrides:` cell.
 */
export interface DrawnCell {
  readonly row: number;
  readonly col: number;
  readonly value: ScalarValue;
  readonly formula: string | null;
  readonly filledFrom: string | null;
  readonly format: string | null;
  readonly rich: readonly DrawnRun[] | null;
  readonly computed: Computed | null;
  readonly overridden: boolean;
  readonly editable: Editable;
  readonly style: StyleValues;
}

export interface DrawnMerge {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

/** Where one facet of a cell came from, in a reader's words, and the span in `file` to go to. */
export interface Source {
  readonly facet: string;
  readonly says: string;
  readonly file: string;
  readonly start: number;
  readonly end: number;
}

/** The answer to one `inspect`, for the cell that asked. */
export interface Inspected {
  readonly kind: 'inspected';
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly sources: readonly Source[];
}

/** The cells the node under the text cursor reaches, named with their sheet. */
export interface Highlighted {
  readonly kind: 'highlighted';
  readonly says: string;
  readonly cells: readonly { readonly sheet: string; readonly row: number; readonly col: number }[];
}

/**
 * Why an edit did not happen, said beside the grid. `choices` are the ways it
 * could be made, for the reader to pick between (ADR-001); `canOverride` offers
 * the exception (ADR-007). Both are about `typed`, which the view sends back
 * when one is taken.
 */
export interface Refused {
  readonly kind: 'refused';
  readonly why: string;
  readonly typed: Typed | null;
  readonly canOverride: boolean;
  readonly choices: readonly Choice[];
}

/** One way of making a refused edit: what it does, how many cells it `moves`, and a `sample` of them. */
export interface Choice {
  readonly id: string;
  readonly what: string;
  readonly moves: number;
  readonly sample: readonly string[];
}

/** What a reader typed into a cell, as the view sent it. */
export interface Typed {
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly text: string;
}

/** Something the host did that the grid does not show on its own, said where the reader asked. */
export interface Said {
  readonly kind: 'said';
  readonly text: string;
}

/** Everything the host sends the view. */
export type ToView = Drawing | Inspected | Highlighted | Refused | Said;

/**
 * Everything the view sends back. `edit`, `resolve` and `override` carry what
 * the reader typed, not what it means — that is decided once, on the host. A
 * sheet is named, not numbered (ADR-023).
 */
export type FromView =
  | { readonly kind: 'inspect'; readonly sheet: string; readonly row: number; readonly col: number }
  | {
      readonly kind: 'reveal';
      readonly file: string;
      readonly start: number;
      readonly end: number;
    }
  | { readonly kind: 'setParam'; readonly name: string; readonly value: string }
  | ({ readonly kind: 'edit' } & Typed)
  | ({ readonly kind: 'empty' } & Ranged)
  | ({ readonly kind: 'resolve'; readonly choice: string } & Typed)
  | ({ readonly kind: 'override'; readonly reason: string } & Typed)
  | {
      readonly kind: 'window';
      readonly sheet: string;
      readonly row: number;
      readonly col: number;
    };

/** A rectangle of the grid a gesture names, in the row and column numbers the view draws. */
export interface Ranged {
  readonly sheet: string;
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

/** Something the projection could not do; the span is carried only to ask the host to go there. */
export interface DrawnDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly file: string;
  readonly start: number;
  readonly end: number;
}
