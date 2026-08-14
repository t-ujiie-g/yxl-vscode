import type { FormulaName, ParamName, StyleName, ValueName } from '@yxl-vscode/units';
import type { Opaque, SpecNode } from './node';
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
  readonly opaque: readonly Opaque[];
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

/**
 * One `defs.styles` entry. The span covers the whole entry, key included, while
 * `style.span` covers only what the name is bound to.
 */
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
