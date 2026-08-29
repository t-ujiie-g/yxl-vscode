import type { Saying } from '@yxl-vscode/diag';
import type { Computed } from '@yxl-vscode/evaluate';
import type { Axis, ScalarValue, StyleSays, StyleValues } from '@yxl-vscode/spec';

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
 * the sheet. `freeze` is the first cell that scrolls (`docs/spec.md` §2).
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
  readonly freeze: { readonly row: number; readonly col: number } | null;
  readonly visibility: 'visible' | 'hidden' | 'very_hidden';
  readonly tabColor: string | null;
  readonly gridlines: boolean;
  readonly split: { readonly x: number; readonly y: number } | null;
  readonly filter: DrawnMerge | null;
  readonly print: DrawnPrint | null;
  readonly protect: DrawnProtect | null;
  readonly tables: readonly DrawnTable[];
  readonly charts: readonly DrawnChart[];
  readonly images: readonly DrawnImage[];
  readonly shapes: readonly DrawnShape[];
}

/**
 * A float dragged to another cell: `node` is the entry it was drawn from, and
 * the anchor moves, never a picture (ADR-029).
 */
export interface MovedFloat {
  readonly sheet: string;
  readonly node: string;
  readonly row: number;
  readonly col: number;
}

/** A float dragged by its corner, to the extent in pixels it was left at. */
export interface SizedFloat {
  readonly sheet: string;
  readonly node: string;
  readonly width: number;
  readonly height: number;
}

/**
 * What a sheet's `print:` comes to: the area to outline, the cells a page starts
 * at, and the rest of it said in a sentence. A preview outlines where the paper
 * falls; it does not paginate (`docs/spec.md` §5).
 */
export interface DrawnPrint {
  readonly area: DrawnMerge | null;
  readonly breaks: readonly { readonly row: number; readonly col: number }[];
  readonly says: string;
}

/**
 * What a sheet's `protect:` comes to. Excel locks every cell by default, so the
 * cells worth marking are the ones a style *unlocks* (`docs/spec.md` §16).
 */
export interface DrawnProtect {
  readonly says: string;
}

/** Where a float's top-left corner sits: the cell it hangs from, and the pixels in from that cell's corner. */
export interface DrawnAt {
  readonly row: number;
  readonly col: number;
  readonly x: number;
  readonly y: number;
}

/** How big a float is drawn, in pixels. */
export interface DrawnSize {
  readonly width: number;
  readonly height: number;
}

/**
 * One chart as a sketch: where it sits, how big it is, and what it names — never
 * what Excel will draw of it (ADR-029).
 */
export interface DrawnChart {
  readonly node: string;
  readonly at: DrawnAt;
  readonly size: DrawnSize;
  readonly type: string;
  readonly title: string | null;
  readonly legend: string;
  readonly x: DrawnChartAxis | null;
  readonly y: DrawnChartAxis | null;
  readonly series: readonly DrawnSeries[];
}

/** One axis of a chart's sketch; an unset end is one Excel scales to the data. */
export interface DrawnChartAxis {
  readonly title: string | null;
  readonly min: number | null;
  readonly max: number | null;
}

/** One series of a chart's sketch: what the legend calls it, and the cells it plots. */
export interface DrawnSeries {
  readonly name: string | null;
  readonly values: string;
  readonly categories: string | null;
}

/**
 * One image as a plate where it sits: `size` is its natural size times `scale`,
 * and `null` where the host could not measure the file, which `why` says.
 */
export interface DrawnImage {
  readonly node: string;
  readonly at: DrawnAt;
  readonly size: DrawnSize | null;
  readonly file: string;
  readonly alt: string | null;
  readonly why: string | null;
}

/** One shape drawn as the geometry it names, in the colours it asks for (`docs/spec.md` §18). */
export interface DrawnShape {
  readonly node: string;
  readonly at: DrawnAt;
  readonly size: DrawnSize;
  readonly kind: string;
  readonly text: readonly DrawnRun[];
  readonly fill: string | null;
  readonly line: { readonly color: string; readonly width: number } | null;
  readonly alt: string | null;
}

/**
 * The sparkline a cell carries: the points it plots, from the values the sheet
 * holds, and the marks it picks out (`docs/spec.md` §19). Display only, and
 * from the evaluated values (ADR-014).
 */
export interface DrawnSparkline {
  readonly type: 'line' | 'column' | 'win_loss';
  readonly points: readonly (number | null)[];
  readonly markers: boolean;
  readonly high: boolean;
  readonly low: boolean;
  readonly axis: boolean;
  readonly min: number | null;
  readonly max: number | null;
  readonly weight: number | null;
  readonly color: string | null;
  readonly colors: {
    readonly markers: string | null;
    readonly high: string | null;
    readonly low: string | null;
  } | null;
}

/**
 * One table over the sheet: the region, the name formulas call it, and the four
 * Table Design toggles that decide how it is banded (`docs/spec.md` §11). The
 * top row is its header.
 */
export interface DrawnTable extends DrawnMerge {
  readonly name: string | null;
  readonly style: string | null;
  readonly bandedRows: boolean;
  readonly bandedColumns: boolean;
  readonly firstColumn: boolean;
  readonly lastColumn: boolean;
}

/** Rows of a `data:` block to be put in order, by the column the selection starts in. */
export interface Sorted extends Ranged {
  readonly down: boolean;
}

/** A rectangle to be filled from its first line: down from the top row, or right from the left column. */
export interface Filled extends Ranged {
  readonly axis: Axis;
}

/** A rectangle asked to be drawn as one cell, or taken back apart (`docs/spec.md` §2). */
export interface Merged extends Ranged {
  readonly merged: boolean;
}

/** A region asked to be a table, or `on: false` to take off the ones it touches. */
export interface Tabled extends Ranged {
  readonly on: boolean;
}

/** A sheet's auto filter, over the selection's header row, or `on: false` to take it off. */
export interface Filtered extends Ranged {
  readonly on: boolean;
}

/** One run of a `rich:` cell retyped: which run of the cell, and what it should say (`docs/spec.md` §3). */
export interface EditedRun {
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly index: number;
  readonly text: string;
}

/**
 * What a find turned up, written again with the text replaced: `at` is the one
 * cell the reader is on, or `null` for every cell the search turns up.
 */
export interface Replaced {
  readonly sheet: string;
  readonly at: string | null;
  readonly looking: string;
  readonly becomes: string;
}

/** A cell's note, as it is written or `text: null` to take it off (`docs/spec.md` §10). */
export interface Noted {
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly text: string | null;
}

/** A `list:` validation over a range, or `choices: null` to take off the ones it touches. */
export interface Validated extends Ranged {
  readonly choices: readonly string[] | null;
}

/** A cell's link as it is written, or `link: null` to take it off (`docs/spec.md` §10). */
export interface Linked {
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly link: { readonly kind: 'url' | 'to'; readonly text: string } | null;
}

/** Where a sheet's panes are asked to be frozen, or `null` to take the freeze off. */
export interface Frozen {
  readonly sheet: string;
  readonly at: { readonly row: number; readonly col: number } | null;
}

/** A diagnostic on the cell it is about; one that reaches no cell stays in the list under the grid. */
export interface MarkedCell {
  readonly row: number;
  readonly col: number;
  readonly message: Saying;
}

/**
 * Whether a cell can be typed into: one node says it, several could, a file
 * beside the spec does, or it holds runs, which are edited one at a time.
 */
export type Editable = 'direct' | 'mediated' | 'external' | 'rich';

/** One run of a `rich:` cell: a piece of its text, and the look that piece wears. */
export interface DrawnRun {
  readonly text: string;
  readonly style: StyleValues;
}

/**
 * A run of columns or rows a band declares; `size` in the spec's units, `null`
 * where it set none. `group` is the outline level, `0` being ungrouped and
 * `null` the key being absent (`docs/spec.md` §4).
 */
export interface Sized {
  readonly first: number;
  readonly last: number;
  readonly size: number | null;
  readonly hidden: boolean;
  readonly group: number | null;
}

/**
 * One cell as it is drawn: what the spec holds, with `computed` kept separate
 * from it (ADR-014) and `format` the one that applies here, since an inherited
 * format does not reach a text cell (`docs/spec.md` §4).
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
  readonly bar: DrawnBar | null;
  readonly icon: DrawnIcon | null;
  readonly note: DrawnNote | null;
  readonly link: DrawnLink | null;
  readonly validation: DrawnValidation | null;
  readonly sparkline: DrawnSparkline | null;
}

/**
 * What a validation asks of a cell, as the view draws it: the choices to offer
 * where it is a list, and what it asks in words (`docs/spec.md` §10).
 */
export interface DrawnValidation {
  readonly choices: readonly string[] | null;
  readonly says: string;
}

/**
 * The link a cell carries: `url` goes out of the workbook and `to` goes to a
 * cell or a defined name in it — which it is, is written rather than read off
 * the target (`docs/spec.md` §10).
 */
export interface DrawnLink {
  readonly kind: 'url' | 'to';
  readonly target: string;
  readonly tip: string | null;
}

/** The note a cell carries, which Excel shows on hover (`docs/spec.md` §10). */
export interface DrawnNote {
  readonly text: string;
  readonly author: string | null;
}

/** Which icon of which set a cell wears; what one looks like is this view's to decide (ADR-029). */
export interface DrawnIcon {
  readonly set: string;
  readonly index: number;
  readonly iconsOnly: boolean;
}

/** A `data_bar` rule's bar behind a cell: how far along the range its value is (`docs/spec.md` §10). */
export interface DrawnBar {
  readonly color: string;
  readonly fraction: number;
  readonly barOnly: boolean;
}

/** A rectangle of the grid, in the row and column numbers the view draws. */
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

/**
 * The answer to one `inspect`, for the cell that asked. `carried` is what the
 * *sheet* holds and this editor does not draw (ADR-011) — about the sheet the
 * cell is on, not about the cell.
 */
export interface Inspected {
  readonly kind: 'inspected';
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly sources: readonly Source[];
  readonly carried: readonly Source[];
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
  readonly why: Saying;
  readonly about: About | null;
  readonly canOverride: boolean;
  readonly choices: readonly Choice[];
}

/**
 * A message the host answers more than one way, and so may refuse as a
 * question: the view sends the same message back with the answer taken
 * (ADR-048).
 */
export type About =
  | ({ readonly kind: 'edit' } & Typed)
  | ({ readonly kind: 'empty' } & Ranged)
  | ({ readonly kind: 'paste' } & Pasted)
  | ({ readonly kind: 'pasteText' } & PastedText)
  | ({ readonly kind: 'wear' } & Worn)
  | ({ readonly kind: 'group' } & Grouped)
  | ({ readonly kind: 'hide' } & Hidden)
  | ({ readonly kind: 'resize' } & Resized)
  | ({ readonly kind: 'line' } & Lined)
  | ({ readonly kind: 'fill' } & Filled)
  | ({ readonly kind: 'sort' } & Sorted)
  | { readonly kind: 'addSheet'; readonly name: string }
  | { readonly kind: 'renameSheet'; readonly sheet: string; readonly name: string }
  | { readonly kind: 'deleteSheet'; readonly sheet: string }
  | { readonly kind: 'moveSheet'; readonly sheet: string; readonly to: number }
  | ({ readonly kind: 'filter' } & Filtered)
  | ({ readonly kind: 'tabled' } & Tabled)
  | ({ readonly kind: 'chart' } & Ranged)
  | ({ readonly kind: 'note' } & Noted)
  | ({ readonly kind: 'replace' } & Replaced)
  | ({ readonly kind: 'link' } & Linked)
  | ({ readonly kind: 'validate' } & Validated)
  | {
      readonly kind: 'setTab';
      readonly sheet: string;
      readonly visibility?: 'visible' | 'hidden';
      readonly color?: string | null;
      readonly gridlines?: boolean;
    };

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

/**
 * What a run of the sheet holds, sent because the view asked to fit a column to
 * it: the host has every cell, the view has the font each is drawn in (ADR-043).
 */
export interface Fitting {
  readonly kind: 'fitting';
  readonly sheet: string;
  readonly axis: Axis;
  readonly at: number;
  readonly cells: readonly DrawnCell[];
}

/**
 * What the rectangle a reader has selected comes to, as every spreadsheet says
 * under the grid: what it holds, how much of that is numbers, and their sum.
 * Display only, and from the evaluated values (ADR-014).
 */
export interface Summed {
  readonly kind: 'summed';
  readonly sheet: string;
  readonly held: number;
  readonly numbers: number;
  readonly sum: number;
}

/**
 * A far end a key asks for: the end of a block in a direction, of the row, or of
 * the sheet. Which cell that is, only the host can say (ADR-019).
 */
export type Far =
  | { readonly kind: 'block'; readonly rows: number; readonly cols: number }
  | { readonly kind: 'row' }
  | { readonly kind: 'sheet' };

/** Where the reader is asking from, what far end they asked for, and their `Shift`. */
export interface Edging {
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly to: Far;
  readonly extend: boolean;
}

/**
 * Where that far end is, which only the host can say: the view holds a window,
 * and a block runs past the end of one (ADR-019). `extend` is the reader's
 * `Shift`, carried back so the answer needs no memory of the question.
 */
export interface Edged {
  readonly kind: 'edged';
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly extend: boolean;
}

/**
 * What the host put on the clipboard for a rectangle the view could not copy
 * itself, so the view knows whose a paste of it would be (ADR-035).
 */
export interface Copied {
  readonly kind: 'copied';
  readonly text: string;
}

/** Where a link inside the workbook goes, for the view to take the reader (`docs/spec.md` §10). */
export interface WentTo {
  readonly kind: 'goTo';
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
}

/** The keyboard back in the grid, after the host had to put it somewhere else. */
export interface Focus {
  readonly kind: 'focus';
}

/** Everything the host sends the view. */
export type ToView =
  | Copied
  | Drawing
  | Edged
  | Fitting
  | Inspected
  | Highlighted
  | Refused
  | Said
  | Focus
  | Found
  | Summed
  | WentTo;

/** The answer a reader took; absent the first time a message is sent (ADR-048). */
interface Answerable {
  readonly choice?: string;
}

/**
 * Everything the view sends back — what the reader typed, not what it means,
 * which is decided once on the host. A sheet is named, not numbered (ADR-023);
 * `ready` is the view saying it holds nothing until the host answers.
 */
export type FromView =
  | { readonly kind: 'ready' }
  | { readonly kind: 'inspect'; readonly sheet: string; readonly row: number; readonly col: number }
  | {
      readonly kind: 'reveal';
      readonly file: string;
      readonly start: number;
      readonly end: number;
    }
  | { readonly kind: 'setParam'; readonly name: string; readonly value: string }
  | { readonly kind: 'find'; readonly sheet: string; readonly text: string }
  | { readonly kind: 'fit'; readonly sheet: string; readonly axis: Axis; readonly at: number }
  | (About & Answerable)
  | { readonly kind: 'undo'; readonly redo: boolean }
  | ({ readonly kind: 'pasteAt' } & PastedAt)
  | ({ readonly kind: 'freeze' } & Frozen)
  | { readonly kind: 'follow'; readonly sheet: string; readonly row: number; readonly col: number }
  | ({ readonly kind: 'merge' } & Merged)
  | ({ readonly kind: 'table' } & Ranged)
  | { readonly kind: 'image'; readonly sheet: string; readonly row: number; readonly col: number }
  | ({ readonly kind: 'moveFloat' } & MovedFloat)
  | ({ readonly kind: 'sizeFloat' } & SizedFloat)
  | ({ readonly kind: 'editRun' } & EditedRun)
  | ({ readonly kind: 'edge' } & Edging)
  | ({ readonly kind: 'copyOut' } & Ranged)
  | ({ readonly kind: 'sum' } & Ranged)
  | ({ readonly kind: 'override'; readonly reason: string } & Typed)
  | {
      readonly kind: 'window';
      readonly sheet: string;
      readonly row: number;
      readonly col: number;
    };

/**
 * Rows or columns put in above `at`, or taken away from there where `by` is
 * below zero — as many as `by` says (`docs/spec.md` §2).
 */
export interface Lined {
  readonly sheet: string;
  readonly axis: Axis;
  readonly at: number;
  readonly by: number;
}

/**
 * Columns dragged to a width in character units, or rows to a height in points
 * (`docs/spec.md` §4). The run is what the reader had selected by its headings,
 * and the one dragged where they had not (ADR-042).
 */
export interface Resized {
  readonly sheet: string;
  readonly axis: Axis;
  readonly first: number;
  readonly last: number;
  readonly size: number;
}

/** Columns or rows a reader asked to group, or to take out of the outline (`docs/spec.md` §4). */
export interface Grouped {
  readonly sheet: string;
  readonly axis: Axis;
  readonly first: number;
  readonly last: number;
  readonly level: number;
}

/** Columns or rows a reader asked to hide, or to show again (`docs/spec.md` §4). */
export interface Hidden {
  readonly sheet: string;
  readonly axis: Axis;
  readonly first: number;
  readonly last: number;
  readonly hidden: boolean;
}

/**
 * A look asked for over a rectangle: the properties the reader changed, and
 * nothing else. `whole` is how the rectangle was taken — a heading takes every
 * cell of a column, which is a band rather than four hundred cells (ADR-041).
 */
export interface Worn extends Ranged {
  readonly want: StyleSays;
  readonly whole: Whole;
}

/** What a selection was made of: cells, or every cell of some columns or rows. */
export type Whole = 'columns' | 'rows' | null;

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
  readonly message: Saying;
  readonly file: string;
  readonly start: number;
  readonly end: number;
}
