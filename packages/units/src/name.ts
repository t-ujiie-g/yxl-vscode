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

/** The identity of one AST node within a session; never written to a spec (ADR-015). */
export type NodeId = Brand<string, 'NodeId'>;

/** Name a node. Total, unlike the readers below: an id is never read from a spec. */
export function nodeId(text: string): NodeId {
  return text as NodeId;
}

/**
 * Read a sheet name. Only the empty string is refused, here and in the four
 * below: Excel's rules (`docs/spec.md` §2) are the compiler's to check (ADR-011).
 */
export function sheetName(text: string): SheetName | null {
  return text === '' ? null : (text as SheetName);
}

/**
 * Why a name a reader typed is not one a sheet can have, or `null` where it is:
 * Excel's own rules, which the compiler refuses a spec over (`docs/spec.md` §2).
 * For a name about to be *written*; a name read from a file is the compiler's.
 */
export function whyNotASheetName(text: string): string | null {
  if (text === '') return 'a sheet needs a name';
  if ([...text].length > 31) return 'a sheet name is at most 31 characters';

  const bad = [...text].find((one) => FORBIDDEN.has(one));
  if (bad !== undefined) return `a sheet name cannot hold \`${bad}\``;
  if (text.startsWith("'") || text.endsWith("'")) {
    return 'a sheet name cannot start or end with an apostrophe';
  }
  if (text === 'History') return '`History` is a name Excel keeps for itself';

  return null;
}

/** The name a new sheet is offered under — `Sheet2`, `Sheet3`, … — past the ones there are. */
export function nextSheetName(taken: readonly SheetName[]): SheetName {
  for (let n = taken.length + 1; ; n += 1) {
    const name = `Sheet${n}` as SheetName;
    if (!taken.includes(name)) return name;
  }
}

const FORBIDDEN: ReadonlySet<string> = new Set([':', '\\', '/', '?', '*', '[', ']']);

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
