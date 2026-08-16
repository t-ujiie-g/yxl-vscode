import { columnIndex, columnLabel } from './grid';

/** How far something moves, in columns and rows; negative goes left and up. */
export interface Offset {
  readonly cols: number;
  readonly rows: number;
}

/** A formula moved, or the reason it could not be. */
export type Moved =
  | { readonly ok: true; readonly formula: string }
  | { readonly ok: false; readonly why: string };

/**
 * A formula as it applies `by` columns and rows away: relative references move,
 * `$`-anchored halves stay, and strings, names and table references come back
 * byte for byte. What Excel does to a shared formula (ECMA-376 §18.3.1.40).
 */
export function moved(formula: string, by: Offset): Moved {
  if (by.cols === 0 && by.rows === 0) return { ok: true, formula };

  const out: string[] = [];
  let at = 0;

  while (at < formula.length) {
    const char = formula[at] as string;

    if (char === '"' || char === "'") {
      const end = quoted(formula, at, char);
      if (end === null) return { ok: false, why: `there is a \`${char}\` here that never closes` };

      out.push(formula.slice(at, end));
      at = end;
      continue;
    }

    if (char === '[') {
      const end = bracketed(formula, at);
      if (end === null) return { ok: false, why: 'there is a `[` here that never closes' };

      out.push(formula.slice(at, end));
      at = end;
      continue;
    }

    if (BREAKS.has(char)) {
      out.push(char);
      at += 1;
      continue;
    }

    const taken = word(formula, at, by);
    if (taken.is === 'off') return { ok: false, why: `\`${taken.word}\` would move off the sheet` };

    out.push(taken.text);
    at = taken.end;
  }

  return { ok: true, formula: out.join('') };
}

/** Excel's own limits, which is what a moved reference has to stay inside. */
const COLUMNS = 16384;
const ROWS = 1048576;

/** Everything that ends a word: the operators, the separators, the brackets, and space. */
const BREAKS = new Set([...' \t\r\n+-*/^%=<>&,;:!()[]{}"\'']);

const CELL = /^(\$?)([A-Za-z]+)(\$?)([0-9]+)$/;
const COLUMN = /^\$?[A-Za-z]+$/;
const ROW = /^\$?[0-9]+$/;

/** A word read from the formula: what it becomes, and where reading goes on. */
type Taken =
  | { readonly is: 'text'; readonly text: string; readonly end: number }
  | { readonly is: 'off'; readonly word: string };

/** One word, moved where it is a reference: a `(`, `[` or `!` after it says it is not one. */
function word(formula: string, at: number, by: Offset): Taken {
  const end = wordEnd(formula, at);
  const text = formula.slice(at, end);
  const after = formula[skipSpace(formula, end)] ?? '';
  if (after === '(' || after === '[' || after === '!') return { is: 'text', text, end };

  if (CELL.test(text)) {
    const cell = movedCell(text, by);
    return cell === null ? { is: 'off', word: text } : { is: 'text', text: cell, end };
  }

  // `A:A` and `1:10` are two words with the range operator between them, and
  // neither half says on its own that it is a reference at all.
  const columns = COLUMN.test(text);
  if (formula[end] !== ':' || !(columns || ROW.test(text))) return { is: 'text', text, end };

  const far = wordEnd(formula, end + 1);
  const other = formula.slice(end + 1, far);
  if (!(columns ? COLUMN : ROW).test(other)) return { is: 'text', text, end };

  const one = columns ? movedColumn(text, by.cols) : movedRow(text, by.rows);
  const two = columns ? movedColumn(other, by.cols) : movedRow(other, by.rows);
  if (one === null || two === null) return { is: 'off', word: `${text}:${other}` };

  return { is: 'text', text: `${one}:${two}`, end: far };
}

/** A cell reference moved; the half that does not move comes back written as it was. */
function movedCell(text: string, by: Offset): string | null {
  const parts = CELL.exec(text);
  if (parts === null) return null;

  const [, colFixed = '', letters = '', rowFixed = '', digits = ''] = parts;
  const movesCol = colFixed === '' && by.cols !== 0;
  const movesRow = rowFixed === '' && by.rows !== 0;
  if (!movesCol && !movesRow) return text;

  const col = columnIndex(letters.toUpperCase()) + by.cols;
  const row = Number(digits) + by.rows;
  if ((movesCol && offColumn(col)) || (movesRow && offRow(row))) return null;

  return `${colFixed}${movesCol ? columnLabel(col) : letters}${rowFixed}${movesRow ? row : digits}`;
}

/** One end of `A:C`, moved; `$A` and a zero move come back as they were written. */
function movedColumn(text: string, cols: number): string | null {
  if (text.startsWith('$') || cols === 0) return text;

  const col = columnIndex(text.toUpperCase()) + cols;
  return offColumn(col) ? null : columnLabel(col);
}

/** One end of `1:10`, by the same rule. */
function movedRow(text: string, rows: number): string | null {
  if (text.startsWith('$') || rows === 0) return text;

  const row = Number(text) + rows;
  return offRow(row) ? null : String(row);
}

function offColumn(col: number): boolean {
  return col < 1 || col > COLUMNS;
}

function offRow(row: number): boolean {
  return row < 1 || row > ROWS;
}

/** Where a word ends: at the next operator, separator, bracket or space. */
function wordEnd(formula: string, at: number): number {
  let end = at;
  while (end < formula.length && !BREAKS.has(formula[end] as string)) end += 1;
  return end;
}

/** Excel takes `SUM (A1)` as a call, so what follows a word is read past the spaces. */
function skipSpace(formula: string, at: number): number {
  let end = at;
  while (formula[end] === ' ' || formula[end] === '\t') end += 1;
  return end;
}

/** Past the closing quote, a doubled one taken as an escape, or `null` where there is none. */
function quoted(formula: string, at: number, quote: string): number | null {
  for (let end = at + 1; end < formula.length; end += 1) {
    if (formula[end] !== quote) continue;
    if (formula[end + 1] === quote) {
      end += 1;
      continue;
    }

    return end + 1;
  }

  return null;
}

/** Past the matching `]`, counting the nesting a structured reference has. */
function bracketed(formula: string, at: number): number | null {
  let depth = 0;
  for (let end = at; end < formula.length; end += 1) {
    if (formula[end] === '[') depth += 1;
    if (formula[end] === ']') {
      depth -= 1;
      if (depth === 0) return end + 1;
    }
  }

  return null;
}
