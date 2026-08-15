import type { ScalarValue } from '@yxl-vscode/spec';
import type { A1Addr, SheetName } from '@yxl-vscode/units';

/**
 * What a formula came to, or what went wrong saying so.
 *
 * An `error` carries Excel's own text — `#DIV/0!`, `#NAME?` — because that is
 * what the workbook will show and what the reader will search for. `unsupported`
 * is this editor's own answer and not Excel's: the formula is fine and *we*
 * cannot compute it, which is a fact about the preview rather than the spec.
 */
export type Computed =
  | { readonly kind: 'value'; readonly value: ScalarValue }
  | { readonly kind: 'error'; readonly error: string }
  | { readonly kind: 'unsupported'; readonly why: string };

/** A cell of the workbook as the engine is given it: an address and what it holds. */
export interface Held {
  readonly at: A1Addr;
  readonly value: ScalarValue;
}

/**
 * One sheet of the workbook the engine is computing against.
 *
 * Every sheet is given, including one that holds no values at all: a sheet of
 * nothing but formulas still has to *exist*, or a reference to it is a reference
 * to a sheet that is not there.
 */
export interface HeldSheet {
  readonly name: SheetName;
  readonly cells: readonly Held[];
}

/**
 * One formula to compute, as it sits in the sheet.
 *
 * `offset` is what makes a filled range computable: the range holds one formula
 * written as it applies at its anchor, and a cell `[across, down]` from there
 * means the same formula with its relative references shifted by that much —
 * which is Excel's own shared-formula rule, not an interpretation of it.
 */
export interface Asked {
  readonly sheet: SheetName;
  readonly at: A1Addr;
  readonly formula: string;
  readonly offset: readonly [number, number];
}

/**
 * A formula engine, as little of one as this needs (ADR-013).
 *
 * Two calls: here is what the workbook holds, and what does this formula come
 * to. Everything else — which order to compute in, what to do with a cell that
 * depends on another — is `evaluate`'s, because that part is about the *spec*
 * and would be the same behind any engine.
 */
export interface Engine {
  holds: (book: readonly HeldSheet[]) => void;
  compute: (asked: Asked) => Computed;
}
