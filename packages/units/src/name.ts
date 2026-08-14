import type { Brand } from './brand';

/** A sheet's name, which is also how `active:` and a cross-sheet reference reach it. */
export type SheetName = Brand<string, 'SheetName'>;

/** A name in `defs.styles`, as a `style:` bareword names it. */
export type StyleName = Brand<string, 'StyleName'>;

/** A name in `defs.values`, as a `{ $ref: }` names it. */
export type ValueName = Brand<string, 'ValueName'>;

/** A name in `defs.formulas`, as a `{ $ref: }` names it. */
export type FormulaName = Brand<string, 'FormulaName'>;

/** A name in `params:`, as a `${...}` placeholder names it. */
export type ParamName = Brand<string, 'ParamName'>;

/** A path as a spec wrote it, in the spec's own separators, never resolved here. */
export type FilePath = Brand<string, 'FilePath'>;

/**
 * The identity of one AST node within a session.
 *
 * Derived from the node's path when a spec loads and never written to a spec
 * (ADR-015).
 */
export type NodeId = Brand<string, 'NodeId'>;

/**
 * Name a node.
 *
 * Total where the rest of this package is partial: an id is derived from text
 * the caller has already made unique, never read from a spec, so there is
 * nothing here to refuse.
 */
export function nodeId(text: string): NodeId {
  return text as NodeId;
}

/**
 * Read a sheet name.
 *
 * The empty string is the only refusal, here and in the four below. Excel's own
 * rules on a sheet name (`docs/spec.md` §2) are checked by `yxl build --check`,
 * which is the validator of record (ADR-011); a spec that breaks one still has
 * to open here, or this editor is no help in fixing it.
 */
export function sheetName(text: string): SheetName | null {
  return text === '' ? null : (text as SheetName);
}

/** Read a style definition's name. */
export function styleName(text: string): StyleName | null {
  return text === '' ? null : (text as StyleName);
}

/** Read a value definition's name. */
export function valueName(text: string): ValueName | null {
  return text === '' ? null : (text as ValueName);
}

/** Read a formula definition's name. */
export function formulaName(text: string): FormulaName | null {
  return text === '' ? null : (text as FormulaName);
}

/** Read a parameter's name. */
export function paramName(text: string): ParamName | null {
  return text === '' ? null : (text as ParamName);
}

/** Read a path, which names nothing when it is empty. */
export function filePath(text: string): FilePath | null {
  return text === '' ? null : (text as FilePath);
}
