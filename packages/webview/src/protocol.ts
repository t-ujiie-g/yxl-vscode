import type { Computed } from '@yxl-vscode/evaluate';
import type { ScalarValue, StyleSays, StyleValues } from '@yxl-vscode/spec';

/**
 * What the host sends the view, and all the view knows of a spec: a projection
 * flattened for JSON, with every decision about how a cell looks made on the
 * side that has the provenance (ADR-001).
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
 * could be made (ADR-001) and `canOverride` offers the exception (ADR-007);
 * both are about `about`, which the view sends back when one is taken.
 */
export interface Refused {
  readonly kind: 'refused';
  readonly why: string;
  readonly about: About | null;
  readonly canOverride: boolean;
  readonly choices: readonly Choice[];
}

/**
 * What a refusal is about — the gesture it came from, which the view sends back
 * when one of the answers is taken. `typed` is the only one an override is
 * offered beside (ADR-007).
 */
export type About =
  | { readonly is: 'typed'; readonly typed: Typed }
  | { readonly is: 'ranged'; readonly ranged: Ranged }
  | { readonly is: 'pasted'; readonly pasted: Pasted }
  | { readonly is: 'text'; readonly text: PastedText }
  | { readonly is: 'worn'; readonly worn: Worn };

/**
 * `Cmd`+`V` in the grid: where it goes, what the grid holds of its own, and what
 * its copy put on the clipboard — which is how the host tells the two pastes
 * apart, since it is the host that reads the clipboard (ADR-035).
 */
export interface PastedAt {
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly from: Ranged | null;
  readonly cut: boolean;
  readonly ours: string | null;
}

/** A rectangle from another spreadsheet as the clipboard gave it, and the cell it is going down on. */
export interface PastedText {
  readonly text: string;
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
}

/** A rectangle copied in the grid, and the cell its top-left corner is going down on. */
export interface Pasted {
  readonly from: Ranged;
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly cut: boolean;
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

/** Every cell of one sheet holding what was searched for, in the order a reader goes through them. */
export interface Found {
  readonly kind: 'found';
  readonly sheet: string;
  readonly text: string;
  readonly cells: readonly { readonly row: number; readonly col: number }[];
}

/** The keyboard back in the grid, after the host had to put it somewhere else. */
export interface Focus {
  readonly kind: 'focus';
}

/** Everything the host sends the view. */
export type ToView = Drawing | Inspected | Highlighted | Refused | Said | Focus | Found;

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
  | { readonly kind: 'find'; readonly sheet: string; readonly text: string }
  | ({ readonly kind: 'edit' } & Typed)
  | ({ readonly kind: 'empty' } & Ranged)
  | ({ readonly kind: 'emptied'; readonly choice: string } & Ranged)
  | { readonly kind: 'undo'; readonly redo: boolean }
  | ({ readonly kind: 'paste' } & Pasted)
  | ({ readonly kind: 'pasted'; readonly choice: string } & Pasted)
  | ({ readonly kind: 'pasteAt' } & PastedAt)
  | ({ readonly kind: 'pastedText'; readonly choice: string } & PastedText)
  | ({ readonly kind: 'wear' } & Worn)
  | ({ readonly kind: 'worn'; readonly choice: string } & Worn)
  | ({ readonly kind: 'resolve'; readonly choice: string } & Typed)
  | ({ readonly kind: 'override'; readonly reason: string } & Typed)
  | {
      readonly kind: 'window';
      readonly sheet: string;
      readonly row: number;
      readonly col: number;
    };

/** A look asked for over a rectangle: the properties the reader changed, and nothing else. */
export interface Worn extends Ranged {
  readonly want: StyleSays;
}

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
