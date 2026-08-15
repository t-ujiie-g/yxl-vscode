import type { ScalarValue, StyleValues } from '@yxl-vscode/spec';

/**
 * What the host sends the view, and the only thing the view knows about a spec.
 *
 * A projection, flattened for the wire: VS Code serializes a webview message as
 * JSON, so the `Map` and the branded types a `CompiledGrid` holds would not
 * survive the trip. Flattening here rather than in the view keeps every
 * decision about *what a cell looks like* on the side that has the provenance
 * to decide it (ADR-001).
 */
export interface Drawing {
  readonly kind: 'drawing';
  readonly file: string;
  readonly sheets: readonly DrawnSheet[];
  readonly params: readonly DrawnParam[];
  readonly diagnostics: readonly DrawnDiagnostic[];
}

/**
 * One declared parameter, as it stands in this preview.
 *
 * `set` is true when the reader has given it a value here rather than letting
 * the spec's default stand — one spec drawn as several workbooks, which is what
 * `--set` does on the command line (`docs/spec.md` §7).
 */
export interface DrawnParam {
  readonly name: string;
  readonly value: string;
  readonly set: boolean;
}

/**
 * One sheet, sized to what it holds.
 *
 * `at` and `rows`/`columns` are the window being drawn; `of` is how far the
 * sheet reaches. A sheet larger than one page is drawn a window at a time and
 * the view asks for another as the reader scrolls, so the grid never holds more
 * elements than a page needs however large the sheet is.
 *
 * A spec with three cells draws three cells' worth of grid rather than a
 * million empty ones: the box is what its written cells, merges, and filled
 * ranges reach.
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

/**
 * A diagnostic on the cells it is about.
 *
 * Not every diagnostic has one: a sheet with no name or a band with a bad `at`
 * reaches no cell, and those stay in the list under the grid. The ones that do
 * are worth marking where the reader is looking.
 */
export interface MarkedCell {
  readonly row: number;
  readonly col: number;
  readonly message: string;
}

/** One run of a `rich:` cell: a piece of its text, and the look that piece wears. */
export interface DrawnRun {
  readonly text: string;
  readonly style: StyleValues;
}

/**
 * A run of columns or rows a band declares something about.
 *
 * `size` is in the spec's own units — character widths across, points down —
 * and is `null` where the band set none, which is every band that only styles
 * or only hides. A run is not a *sized* run: it is a band with a span, and the
 * size is one of the things it may not say.
 */
export interface Sized {
  readonly first: number;
  readonly last: number;
  readonly size: number | null;
  readonly hidden: boolean;
}

/**
 * One cell as it is drawn: what it holds, what it is called, and how it looks.
 *
 * `value` and `formula` can both be present — a formula with the cached result
 * Excel shows until it recomputes — and neither has been evaluated here
 * (ADR-014).
 *
 * `format` is the number format that applies here, which is not always the one
 * in `style`: Excel does not apply an *inherited* format to a text cell
 * (`docs/spec.md` §4), and that is decided where the layers are.
 *
 * `filledFrom` names the anchor of the `formulas:` range this cell belongs to,
 * for every cell of it but the anchor. The formula shown is the one the range
 * holds, written as it applies **there**: Excel shifts its relative references
 * per cell and this does not, so the view says which cell it is really reading
 * rather than showing a formula that is wrong here.
 *
 * `rich` is a cell whose text is written in runs of its own (`docs/spec.md` §3),
 * and it is what the cell *says* — a cell that has runs has no `value`.
 */
export interface DrawnCell {
  readonly row: number;
  readonly col: number;
  readonly value: ScalarValue;
  readonly formula: string | null;
  readonly filledFrom: string | null;
  readonly format: string | null;
  readonly rich: readonly DrawnRun[] | null;
  readonly style: StyleValues;
}

export interface DrawnMerge {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

/**
 * Where one facet of a cell came from, and where to go to change it.
 *
 * `facet` is what the answer is about — `value`, `format`, or a style leaf like
 * `font.bold` — and `says` is the answer in the words a reader wants. The span
 * is into `file`, which is not always the file that was opened: an `$include`
 * makes a definition live somewhere else.
 */
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

/**
 * The cells one node of the spec reaches, for the cursor that is sitting in it.
 *
 * The other half of the jump: a reader with the cursor on `defs.styles.header`
 * sees which cells wear it. A cell is named by its sheet, because a definition
 * reaches across all of them.
 */
export interface Highlighted {
  readonly kind: 'highlighted';
  readonly says: string;
  readonly cells: readonly { readonly sheet: string; readonly row: number; readonly col: number }[];
}

/** Everything the host sends the view. */
export type ToView = Drawing | Inspected | Highlighted;

/**
 * Everything the view sends back.
 *
 * Questions and knobs, none of which touches the spec: *where did this cell
 * come from*, *take me there*, *draw it as though this parameter were something
 * else*, and *draw the part of the sheet I have scrolled to*. Nothing here
 * writes: the file on disk is untouched.
 *
 * A sheet is named rather than numbered, here and in the answers: the spec may
 * have been read again since the view drew it, and a name is what the reader
 * pointed at (ADR-023).
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
  | {
      readonly kind: 'window';
      readonly sheet: string;
      readonly row: number;
      readonly col: number;
    };

/**
 * Something the projection could not do, as the view lists it.
 *
 * The span is an offset into `file`, which the view cannot read — it carries it
 * only to ask the host to go there, the same way an inspector line does.
 */
export interface DrawnDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly file: string;
  readonly start: number;
  readonly end: number;
}
