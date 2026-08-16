import type {
  FormulaName,
  ParamName,
  QualifiedAddr,
  StyleName,
  ValueName,
} from '@yxl-vscode/units';
import type { CellFacets } from './cell';
import type { Opaque, SpecNode, Templated } from './node';
import type { Sheet } from './sheet';
import type { Style } from './style';
import type { ScalarValue } from './value';

/**
 * A whole spec as this editor models it — the truth patches apply to and the
 * compiler's only input (ADR-001). What is not modeled is in `opaque`, per
 * document and per sheet, and is never dropped or reformatted (ADR-011).
 * `date1904` is modeled because it decides what every date *is*.
 */
export interface SpecDoc extends SpecNode {
  readonly sheets: readonly Sheet[];
  readonly params: readonly Param[];
  readonly defs: Defs;
  readonly overrides: readonly Override[];
  readonly date1904: boolean;
  readonly opaque: readonly Opaque[];
}

/**
 * One deliberate one-off deviation (`docs/spec.md` §23, ADR-007): the cell it
 * lands on, the facets it replaces, and why. Applied after every rule that
 * wrote the cell; the facets are independent, and `reason` is for the reader.
 * Where it may land is checked with the whole workbook in view, not here.
 */
export interface Override extends SpecNode, CellFacets {
  readonly at: Templated<QualifiedAddr>;
  readonly reason: string | null;
}

/** One `params:` entry and its default, kept as written: substitution is the compiler's. */
export interface Param extends SpecNode {
  readonly name: ParamName;
  readonly value: ScalarValue;
}

/** What `defs:` declares, in three namespaces that do not see each other (`docs/spec.md` §6). */
export interface Defs {
  readonly styles: readonly StyleDef[];
  readonly values: readonly ValueDef[];
  readonly formulas: readonly FormulaDef[];
}

/** One `defs.styles` entry; the span covers the whole entry, key included. */
export interface StyleDef extends SpecNode {
  readonly name: StyleName;
  readonly style: Style;
}

/** One `defs.values` entry, which compiles to an Excel defined name. */
export interface ValueDef extends SpecNode {
  readonly name: ValueName;
  readonly value: ScalarValue;
}

/** One `defs.formulas` entry, its body kept without a leading `=`. */
export interface FormulaDef extends SpecNode {
  readonly name: FormulaName;
  readonly body: string;
}
