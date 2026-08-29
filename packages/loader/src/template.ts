import type { Node } from '@yxl-vscode/cst';
import type { Saying, Span } from '@yxl-vscode/diag';
import type { Templated } from '@yxl-vscode/spec';
import {
  type A1Addr,
  type A1Range,
  type Color,
  type ColumnSpan,
  type FilePath,
  type FormulaName,
  filePath,
  formulaName,
  parseA1Addr,
  parseA1Range,
  parseColor,
  parseColumnSpan,
  parseQualifiedAddr,
  parseRowSpan,
  type QualifiedAddr,
  type RowSpan,
  type SheetName,
  type StyleName,
  sheetName,
  styleName,
  type ValueName,
  valueName,
} from '@yxl-vscode/units';
import { CODE, type Code } from './codes';
import { type Ctx, reject } from './ctx';
import { expectText } from './read';
import { say } from './text';

/** One vocabulary a spec's text is read into: the reader, what to call it, and the code. */
export interface Kind<T> {
  readonly code: Code;
  readonly noun: Saying;
  readonly read: (text: string) => T | null;
}

/**
 * A closed vocabulary as a `Kind`, so a `${...}` standing where a spelling goes
 * is carried rather than refused (`docs/spec.md` §7).
 */
export function spelling<T extends string>(vocabulary: readonly T[]): Kind<T> {
  return {
    code: CODE.unknownSpelling,
    noun: say('loader.one-of-these', { choices: vocabulary.join(', ') }),
    read: (text) => vocabulary.find((known) => known === text) ?? null,
  };
}

export const ADDRESS: Kind<A1Addr> = {
  code: CODE.badAddress,
  noun: say('loader.a-cell-reference'),
  read: parseA1Addr,
};

export const QUALIFIED: Kind<QualifiedAddr> = {
  code: CODE.badAddress,
  noun: say('loader.a-sheet-and-a-cell'),
  read: parseQualifiedAddr,
};

export const RANGE: Kind<A1Range> = {
  code: CODE.badRange,
  noun: say('loader.a-range'),
  read: parseA1Range,
};

export const COLUMN: Kind<ColumnSpan> = {
  code: CODE.badColumn,
  noun: say('loader.a-column'),
  read: parseColumnSpan,
};

export const ROW: Kind<RowSpan> = {
  code: CODE.badRow,
  noun: say('loader.a-row'),
  read: parseRowSpan,
};

export const COLOR: Kind<Color> = {
  code: CODE.badColor,
  noun: say('loader.a-hex-colour'),
  read: parseColor,
};

export const SHEET_NAME: Kind<SheetName> = {
  code: CODE.badName,
  noun: say('loader.a-name'),
  read: sheetName,
};

export const STYLE_NAME: Kind<StyleName> = {
  code: CODE.badName,
  noun: say('loader.a-style-name'),
  read: styleName,
};

export const VALUE_NAME: Kind<ValueName> = {
  code: CODE.badName,
  noun: say('loader.a-value-name'),
  read: valueName,
};

export const FORMULA_NAME: Kind<FormulaName> = {
  code: CODE.badName,
  noun: say('loader.a-formula-name'),
  read: formulaName,
};

export const PATH: Kind<FilePath> = {
  code: CODE.badPath,
  noun: say('loader.a-path'),
  read: filePath,
};

/** Read a node's text as `kind`, or `null` with the reason reported. */
export function readAs<T>(ctx: Ctx, node: Node, what: Saying, kind: Kind<T>): Templated<T> | null {
  const text = expectText(ctx, node, what);
  return text === null ? null : readTextAs(ctx, text, node.span, what, kind);
}

/** The same, where the text is a mapping key rather than a node of its own. */
export function readTextAs<T>(
  ctx: Ctx,
  text: string,
  at: Span,
  what: Saying,
  kind: Kind<T>,
): Templated<T> | null {
  if (holdsPlaceholder(text)) return { kind: 'template', text };

  const value = kind.read(text);
  if (value === null)
    reject(ctx, kind.code, say('loader.is-not', { what, noun: kind.noun, text }), at);
  return value;
}

/** Whether the text holds a `${...}` a parameter will fill in; `$$`, a lone `$` and an unclosed `${` do not (`docs/spec.md` §7). */
function holdsPlaceholder(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '$') continue;
    if (text[index + 1] === '$') {
      index++;
      continue;
    }
    if (text[index + 1] === '{' && text.indexOf('}', index + 2) >= 0) return true;
  }
  return false;
}
