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
 * A whole spec, as this editor models it: the truth that patches apply to, and
 * the only input the compiler has (ADR-001).
 *
 * Every top-level construct this editor does not model is in `opaque` — the
 * document's own keys and, per sheet, that sheet's. Nothing is dropped and
 * nothing is reformatted (ADR-011).
 */
export interface SpecDoc extends SpecNode {
  readonly sheets: readonly Sheet[];
  readonly params: readonly Param[];
  readonly defs: Defs;
  readonly overrides: readonly Override[];
  readonly opaque: readonly Opaque[];
}

/**
 * One deliberate one-off deviation (`docs/spec.md` §23, ADR-007): the cell it
 * lands on, the facets it replaces, and why.
 *
 * Applied after every rule that wrote the cell, by construction rather than by
 * where it sits in the file. The facets are independent — one that gives a
 * `value` leaves the styling alone — and `reason` is for whoever reads the spec
 * in six months; nothing compiles it.
 *
 * What an override may land on is checked where the whole workbook is in view,
 * not here: that it names a declared sheet, that no second override takes the
 * same cell, that something actually writes that cell, and that it is not the
 * anchor of a filled range.
 */
export interface Override extends SpecNode, CellFacets {
  readonly at: Templated<QualifiedAddr>;
  readonly reason: string | null;
}

/**
 * One `params:` entry and the default it declares.
 *
 * The default is the text as written, so a default that refers to another
 * parameter still says so; substitution happens in the compiler.
 */
export interface Param extends SpecNode {
  readonly name: ParamName;
  readonly value: ScalarValue;
}

/**
 * What `defs:` declares, in three namespaces that do not see each other: the
 * same name may be a style, a value, and a formula at once.
 *
 * Empty lists mean the spec declared none, which is not distinguished from a
 * spec with no `defs:` key at all — a definition is added by path, and the path
 * is the same either way.
 */
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
