import type { ScalarValue } from '@yxl-vscode/spec';
import type { A1Addr, NodeId, SheetName } from '@yxl-vscode/units';

/**
 * What a formula came to. An `error` carries Excel's own text (`#DIV/0!`);
 * `unsupported` is this preview's answer, not the workbook's.
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

/** One sheet of the workbook the engine computes against; every sheet is given, values or not. */
export interface HeldSheet {
  readonly name: SheetName;
  readonly cells: readonly Held[];
}

/**
 * One formula to compute: `offset` is `[across, down]` from the anchor it was
 * written for, by which the relative references shift, and `asks` names the
 * conditional rule where the formula tests a cell rather than filling one.
 */
export interface Asked {
  readonly sheet: SheetName;
  readonly at: A1Addr;
  readonly formula: string;
  readonly offset: readonly [number, number];
  readonly asks?: NodeId;
}

/**
 * What a formula names. `unknown` is every name the engine has nothing behind —
 * a table, a defined name, a function it lacks — and a formula holding one is
 * not computed at all; `reads` is the sheets it reads from.
 */
export interface About {
  readonly unknown: readonly string[];
  readonly reads: readonly SheetName[];
}

/** A formula engine, as little of one as this needs (ADR-013): load, name, compute. */
export interface Engine {
  holds: (book: readonly HeldSheet[]) => void;
  about: (asked: Asked) => About;
  compute: (asked: Asked) => Computed;
}
