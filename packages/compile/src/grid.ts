import type { Diagnostic } from '@yxl-vscode/diag';
import type {
  CellType,
  Comparison,
  ConditionalTest,
  ErrorStyle,
  LinkTarget,
  Said,
  ScalarValue,
  Split,
  StyleSays,
  StyleValues,
  Visibility,
} from '@yxl-vscode/spec';
import type { A1Addr, Color, NodeId, Rect, SheetName, StyleName } from '@yxl-vscode/units';
import type { CellProvenance } from './provenance';
import type { StyleLayer } from './style';

/**
 * The workbook as the grid draws it: a projection computed forward from the
 * spec, never edited (ADR-001). Every part carries the `NodeId` that produced
 * it.
 */
export interface CompiledGrid {
  readonly sheets: readonly CompiledSheet[];
  readonly styles: readonly DeclaredStyle[];
  readonly diagnostics: readonly Diagnostic[];
}

/** One look the spec declares, by what its name resolves to — what a style write reuses (ADR-037). */
export interface DeclaredStyle {
  readonly name: StyleName;
  readonly gives: StyleSays;
  readonly node: NodeId;
}

/**
 * One sheet, held sparse: `cellAt` answers for an address whichever construct
 * holds it. `freeze` is the cell the rows above and columns left of stay put
 * at, and `A1` there freezes nothing (`docs/spec.md` §2).
 */
export interface CompiledSheet {
  readonly name: SheetName;
  readonly node: NodeId;
  readonly cells: ReadonlyMap<string, CompiledCell>;
  readonly fills: readonly CompiledFill[];
  readonly columns: readonly CompiledBand[];
  readonly rows: readonly CompiledBand[];
  readonly merges: readonly CompiledMerge[];
  readonly freeze: A1Addr | null;
  readonly visibility: Visibility;
  readonly tabColor: Color | null;
  readonly gridlines: boolean;
  readonly split: Split | null;
  readonly conditional: readonly CompiledRule[];
  readonly filter: Rect | null;
  readonly notes: ReadonlyMap<string, CompiledNote>;
  readonly links: ReadonlyMap<string, CompiledLink>;
  readonly validations: readonly CompiledValidation[];
  readonly tables: readonly CompiledTable[];
}

/**
 * One `tables:` entry with its range read: a region that *is* a table, whose
 * top row names its columns (`docs/spec.md` §11).
 */
export interface CompiledTable {
  readonly rect: Rect;
  readonly name: string | null;
  readonly style: string | null;
  readonly bandedRows: boolean;
  readonly bandedColumns: boolean;
  readonly firstColumn: boolean;
  readonly lastColumn: boolean;
  readonly node: NodeId;
}

/**
 * What a validation asks of a cell, its range read. A `listFrom` keeps the
 * range it names rather than its cells: they may be on another sheet, which is
 * the whole grid's to answer for (`docs/spec.md` §10).
 */
export type CompiledAsk =
  | { readonly kind: 'list'; readonly choices: readonly ScalarValue[] }
  | { readonly kind: 'listFrom'; readonly sheet: SheetName | null; readonly rect: Rect }
  | {
      readonly kind: 'whole' | 'decimal' | 'text_length' | 'date';
      readonly compares: Comparison;
    };

/** One `validations:` entry: what it covers, what it asks, and what it says about it. */
export interface CompiledValidation {
  readonly rect: Rect;
  readonly asks: CompiledAsk;
  readonly allowBlank: boolean;
  readonly prompt: Said | null;
  readonly error: (Said & { readonly style: ErrorStyle }) | null;
  readonly node: NodeId;
}

/** One link on a cell, its target substituted; where it goes is the spec's own (`docs/spec.md` §10). */
export interface CompiledLink {
  readonly at: A1Addr;
  readonly target: LinkTarget;
  readonly tip: string | null;
  readonly node: NodeId;
}

/** One note on a cell, its text substituted; the cell shows its own value still (`docs/spec.md` §10). */
export interface CompiledNote {
  readonly at: A1Addr;
  readonly text: string;
  readonly author: string | null;
  readonly node: NodeId;
}

/** What decides a rule, its colours substituted; everything else is the spec's own (`docs/spec.md` §10). */
export type CompiledTest =
  | Exclude<ConditionalTest, { kind: 'colorScale' | 'dataBar' }>
  | {
      readonly kind: 'colorScale';
      readonly low: Color;
      readonly middle: Color | null;
      readonly high: Color;
    }
  | { readonly kind: 'dataBar'; readonly color: Color; readonly barOnly: boolean };

/**
 * One `conditional:` rule with its range read: what decides it is the spec's
 * own, and the look it applies is resolved like any other (`docs/spec.md` §10).
 */
export interface CompiledRule {
  readonly rect: Rect;
  readonly test: CompiledTest;
  readonly style: readonly StyleLayer[];
  readonly stopIfTrue: boolean;
  readonly node: NodeId;
}

/** One `formulas:` range, kept as a range: `D2:D1048576` is two words, not a million cells (ADR-019). */
export interface CompiledFill {
  readonly rect: Rect;
  readonly anchor: A1Addr;
  readonly formula: string;
  readonly node: NodeId;
}

/** One run of a `rich:` cell: a piece of its text and the look that piece alone wears (`docs/spec.md` §3). */
export interface CompiledRun {
  readonly text: string;
  readonly look: StyleValues;
}

/**
 * One cell, with where each facet came from. `value` is after substitution and
 * `$ref`; `formula` is the body without `=`, and a cell may hold both. `style`
 * is what this cell contributed; how it finally looks is `styleAt`.
 */
export interface CompiledCell {
  readonly at: A1Addr;
  readonly value: ScalarValue;
  readonly type: CellType | null;
  readonly formula: string | null;
  readonly format: string | null;
  readonly rich: readonly CompiledRun[] | null;
  readonly style: readonly StyleLayer[];
  readonly provenance: CellProvenance;
}

/**
 * One band of columns or rows. `size` is a width in character units or a height
 * in points; `null` leaves Excel's default (`docs/spec.md` §4).
 */
export interface CompiledBand {
  readonly first: number;
  readonly last: number;
  readonly size: number | null;
  readonly hidden: boolean | null;
  readonly group: number | null;
  readonly style: readonly StyleLayer[];
  readonly node: NodeId;
}

/** One merged region; the grid shows the top-left cell's value across it. */
export interface CompiledMerge {
  readonly rect: Rect;
  readonly node: NodeId;
}
