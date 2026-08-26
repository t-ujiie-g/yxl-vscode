import { type A1Addr, type A1Range, parseA1Addr, parseA1Range } from './a1';
import { type SheetName, sheetName } from './name';

/** A cell named together with its sheet — `Sales!E37` — as an override's `at:` is. */
export interface QualifiedAddr {
  readonly sheet: SheetName;
  readonly at: A1Addr;
}

/** `Sales!E37` — the one spelling of a qualified cell; `parseQualifiedAddr` reads it back. */
export function qualified(sheet: SheetName, at: A1Addr): string {
  return `${sheet}!${at}`;
}

/**
 * Read a sheet-qualified cell reference in either of Excel's spellings —
 * `Sales!E37`, or `'Q3 data'!A1` with `''` for an apostrophe. One cell only:
 * a range is refused (`docs/spec.md` §23).
 */
export function parseQualifiedAddr(text: string): QualifiedAddr | null {
  const split = text.startsWith("'") ? quoted(text) : plain(text);
  if (split === null) return null;

  const sheet = sheetName(split.name);
  const at = parseA1Addr(split.rest);
  return sheet === null || at === null ? null : { sheet, at };
}

/**
 * A cell that may name its sheet — `Figures!B1` or `B1`, where `null` is the
 * sheet it was written on — as a chart series' `name_from:` is.
 */
export interface QualifiedCell {
  readonly sheet: SheetName | null;
  readonly at: A1Addr;
}

/** The same as `parseQualifiedAddr`, for the places where naming the sheet is optional. */
export function parseQualifiedCell(text: string): QualifiedCell | null {
  const split = text.startsWith("'") ? quoted(text) : plain(text);
  if (split === null) {
    const here = parseA1Addr(text);
    return here === null ? null : { sheet: null, at: here };
  }

  const sheet = sheetName(split.name);
  const at = parseA1Addr(split.rest);
  return sheet === null || at === null ? null : { sheet, at };
}

/**
 * A range that may name its sheet — `Statuses!A1:A3` or `A1:A3`, where `null`
 * is the sheet it was written on — as a validation's `from:` is.
 */
export interface QualifiedRange {
  readonly sheet: SheetName | null;
  readonly at: A1Range;
}

/** The same for a range, in both spellings and unqualified; one cell is not a range. */
export function parseQualifiedRange(text: string): QualifiedRange | null {
  const split = text.startsWith("'") ? quoted(text) : plain(text);
  if (split === null) {
    const here = parseA1Range(text);
    return here === null ? null : { sheet: null, at: here };
  }

  const sheet = sheetName(split.name);
  const at = parseA1Range(split.rest);
  return sheet === null || at === null ? null : { sheet, at };
}

/** An unquoted name holds no `!`, so the first one divides. */
function plain(text: string): { name: string; rest: string } | null {
  const bang = text.indexOf('!');
  return bang < 0 ? null : { name: text.slice(0, bang), rest: text.slice(bang + 1) };
}

function quoted(text: string): { name: string; rest: string } | null {
  let name = '';
  let index = 1;

  while (index < text.length) {
    if (text.charAt(index) !== "'") {
      name += text.charAt(index);
      index += 1;
      continue;
    }
    if (text.charAt(index + 1) === "'") {
      name += "'";
      index += 2;
      continue;
    }
    break;
  }

  const closed = text.charAt(index) === "'" && text.charAt(index + 1) === '!';
  return closed ? { name, rest: text.slice(index + 2) } : null;
}
