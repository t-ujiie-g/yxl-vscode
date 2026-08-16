import type { Computed } from '@yxl-vscode/evaluate';
import type { ScalarValue, StyleValues } from '@yxl-vscode/spec';

/**
 * What the host sends the view, and the only thing the view knows about a spec.
 *
 * `uncomputed` is why some cells show a formula rather than what it comes to,
 * or `null` where everything computed.
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
  readonly uncomputed: Uncomputed | null;
}

/**
 * Why a formula shows as a formula.
 *
 * `names` is what the preview could not resolve well enough to compute anything
 * from — a table, a workbook-defined name, a function Excel has and this does
 * not. `tooMany` is a workbook past the size this will compute, where nothing is
 * computed rather than the part that fit: a total over half a computed range is
 * a wrong number.
 */
export type Uncomputed =
  | { readonly kind: 'names'; readonly names: readonly string[] }
  | { readonly kind: 'tooMany'; readonly limit: number };

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

/**
 * Whether a cell can be typed into, in the terms of what stands in the way.
 *
 * `direct` — one node of the spec says it, and typing changes that node.
 * `mediated` — more than one thing could change to make the edit, so it is a
 * question rather than an edit until the phase that asks it.
 * `external` — the value lives in a file beside the spec.
 */
export type Editable = 'direct' | 'mediated' | 'external';

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
 * `value` and `formula` are what the *spec* holds: a formula with the cached
 * result Excel shows until it recomputes, and neither is anything this computed.
 * What it computed is `computed`, and it is a separate field on purpose — that
 * is the whole of ADR-014 made structural.
 *
 * `format` is the number format that applies here, which is not always the one
 * in `style`: Excel does not apply an *inherited* format to a text cell
 * (`docs/spec.md` §4), and that is decided where the layers are.
 *
 * `filledFrom` names the anchor of the `formulas:` range this cell belongs to,
 * for every cell of it but the anchor. The `formula` is the one the range holds,
 * written as it applies **there** rather than here — so a cell of a range that
 * was not computed says which cell it is really reading instead of showing a
 * formula that is wrong where it stands. A computed one shows its own result,
 * because the shift Excel applies is what computing it applied too.
 *
 * `rich` is a cell whose text is written in runs of its own (`docs/spec.md` §3),
 * and it is what the cell *says* — a cell that has runs has no `value`.
 *
 * `computed` is what the formula came to, or why it could not be computed.
 *
 * `overridden` is a cell an `overrides:` entry writes: an exception somebody
 * made on purpose, and worth seeing without asking.
 *
 * `editable` is whether this cell can be typed into at all, and why not where
 * it cannot — a fact the reader is owed *before* they try, not after.
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

/**
 * Why an edit did not happen, for the view to say where the reader is looking.
 *
 * A refusal is an answer, so it goes next to the grid rather than into a corner
 * of the window: an edit that appears to do nothing is the one thing worse than
 * an edit that is refused.
 *
 * `choices` are the ways the edit *could* be made, each with what it would move,
 * for the reader to pick between — the editor enumerates and never picks
 * (ADR-001). `override` is the same edit offered as the exception it would have
 * to be (`docs/spec.md` §23) — present when there is a cell an override could
 * name, and never taken without the reader saying so (ADR-007).
 */
export interface Refused {
  readonly kind: 'refused';
  readonly why: string;
  readonly override: Typed | null;
  readonly choices: readonly Choice[];
}

/**
 * One way of making a refused edit, as the reader is shown it.
 *
 * `moves` is how many cells the choice would change and `sample` a few of them
 * by name: a count alone is a number to guess at, and the whole list of four
 * hundred is not a thing to read before deciding.
 */
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

/**
 * Something the host did, said where the reader asked for it.
 *
 * The counterpart of a refusal: an edit that *worked* is usually its own
 * announcement — the grid changes — but one that lands somewhere the reader
 * cannot see needs a word, and one that lands nowhere needs it more.
 */
export interface Said {
  readonly kind: 'said';
  readonly text: string;
}

/** Everything the host sends the view. */
export type ToView = Drawing | Inspected | Highlighted | Refused | Said;

/**
 * Everything the view sends back.
 *
 * Questions, knobs, and — since the phase that writes — one edit: *where did
 * this cell come from*, *take me there*, *draw it as though this parameter were
 * something else*, *draw the part of the sheet I have scrolled to*, and *put
 * this in that cell*.
 *
 * `edit`, `resolve` and `override` carry what the reader typed, not what it
 * means. A leading `=` makes it a formula, exactly as it does in Excel, and
 * deciding that here would be deciding it twice. The last two are sent only
 * after the first was refused and the reader chose between the answers.
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
  | ({ readonly kind: 'edit' } & Typed)
  | ({ readonly kind: 'resolve'; readonly choice: string } & Typed)
  | ({ readonly kind: 'override'; readonly reason: string } & Typed)
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
