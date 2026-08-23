import type { Axis } from './band';
import { columnIndex, columnLabel } from './grid';
import type { SheetName } from './name';

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

  return walked(formula, sliding(by));
}

/**
 * A formula with every reference to `from` naming `to` instead — the sheet's
 * own name, quoted again where the new one needs it (`docs/spec.md` §2).
 */
export function renamed(formula: string, from: SheetName, to: SheetName): Moved {
  if (from === to) return { ok: true, formula };

  return walked(formula, calling(from, to));
}

/** Renaming a sheet: only the name before a `!` moves, and every reference keeps its address. */
function calling(from: SheetName, to: SheetName): Rule {
  return {
    cell: (text) => text,
    column: (text) => text,
    row: (text) => text,
    why: (word) => `\`${word}\` could not be written again`,
    named: (name) => (name === from ? sheetSpelled(to) : name),
  };
}

/** A sheet name as a formula writes it: quoted where anything but a word would need it. */
export function sheetSpelled(name: SheetName): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) ? name : `'${name.replaceAll("'", "''")}'`;
}

/** A row or a column inserted (`by` above zero) or taken away, in one sheet. */
export interface Line {
  readonly sheet: SheetName;
  readonly axis: Axis;
  readonly at: number;
  readonly by: number;
}

/**
 * A formula written in `of`, as it reads once that line is drawn: every
 * reference into that sheet from `at` on moves, and a `$` does not hold one
 * still — the cell it names has moved. What Excel does to the sheet.
 */
export function shifted(formula: string, of: SheetName, line: Line): Moved {
  if (line.by === 0) return { ok: true, formula };

  return walked(formula, past(of, line));
}

/** Every reference of a formula rewritten by one rule, or the reason one could not be. */
function walked(formula: string, rule: Rule): Moved {
  const out: string[] = [];
  let at = 0;
  // The sheet the next word is qualified by, since `Sales!A1` is two words.
  let named: string | null = null;

  while (at < formula.length) {
    const char = formula[at] as string;

    if (char === '"' || char === "'") {
      const end = quoted(formula, at, char);
      if (end === null) return { ok: false, why: `there is a \`${char}\` here that never closes` };

      const text = formula.slice(at, end);
      const quotes = char === "'" && formula[end] === '!';
      named = quotes ? text.slice(1, -1) : null;
      out.push(quotes && rule.named !== undefined ? rule.named(named as string) : text);
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
      if (char !== '!') named = null;
      out.push(char);
      at += 1;
      continue;
    }

    const taken = word(formula, at, rule, named);
    if (taken.is === 'off') return { ok: false, why: rule.why(taken.word) };

    named = taken.names;
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

/** How a rule rewrites each kind of reference; `null` is one it cannot, which `why` names. */
interface Rule {
  readonly cell: (text: string, of: string | null) => string | null;
  readonly column: (text: string, of: string | null) => string | null;
  readonly row: (text: string, of: string | null) => string | null;
  readonly why: (word: string) => string;
  /** How the sheet a reference names is written, where a rule rewrites that instead. */
  readonly named?: (name: string) => string;
}

/** Moving a shared formula: relative halves slide, `$`-anchored ones hold still. */
function sliding(by: Offset): Rule {
  return {
    cell: (text) => movedCell(text, by),
    column: (text) => movedColumn(text, by.cols),
    row: (text) => movedRow(text, by.rows),
    why: (word) => `\`${word}\` would move off the sheet`,
  };
}

/** What stands from `at` on moves whatever the `$` says; a reference into what goes is refused. */
function past(of: SheetName, line: Line): Rule {
  const { axis, at, by } = line;
  const theirs = (named: string | null) => (named ?? of) === line.sheet;

  const along = (one: number): number | null => {
    if (one < at) return one;
    if (by < 0 && one < at - by) return null;

    return one + by;
  };

  const ends = (text: string, which: Axis, named: string | null) => {
    if (which !== axis || !theirs(named)) return text;

    const held = text.startsWith('$') ? '$' : '';
    const bare = held === '' ? text : text.slice(1);
    const one = which === 'column' ? columnIndex(bare.toUpperCase()) : Number(bare);
    const now = along(one);
    if (now === null || (which === 'column' ? offColumn(now) : offRow(now))) return null;

    return `${held}${which === 'column' ? columnLabel(now) : now}`;
  };

  return {
    cell: (text, named) => {
      const parts = CELL.exec(text);
      if (parts === null) return null;

      const [, colFixed = '', letters = '', rowFixed = '', digits = ''] = parts;
      const col = ends(`${colFixed}${letters}`, 'column', named);
      const row = ends(`${rowFixed}${digits}`, 'row', named);

      return col === null || row === null ? null : `${col}${row}`;
    },
    column: (text, named) => ends(text, 'column', named),
    row: (text, named) => ends(text, 'row', named),
    why: (word) =>
      by < 0
        ? `\`${word}\` names a ${axis} this would take away`
        : `\`${word}\` would move off the sheet`,
  };
}

/** A word read from the formula: what it becomes, and where reading goes on. */
type Taken =
  | {
      readonly is: 'text';
      readonly text: string;
      readonly end: number;
      readonly names: string | null;
    }
  | { readonly is: 'off'; readonly word: string };

/** One word, moved where it is a reference: a `(`, `[` or `!` after it says it is not one. */
function word(formula: string, at: number, rule: Rule, of: string | null): Taken {
  const end = wordEnd(formula, at);
  const text = formula.slice(at, end);
  const after = formula[skipSpace(formula, end)] ?? '';
  if (after === '(' || after === '[' || after === '!') {
    const sheet = after === '!' && rule.named !== undefined ? rule.named(text) : text;
    return { is: 'text', text: sheet, end, names: after === '!' ? text : null };
  }

  if (CELL.test(text)) {
    const cell = rule.cell(text, of);
    return cell === null ? { is: 'off', word: text } : { is: 'text', text: cell, end, names: null };
  }

  // `A:A` and `1:10` are two words with the range operator between them, and
  // neither half says on its own that it is a reference at all.
  const columns = COLUMN.test(text);
  if (formula[end] !== ':' || !(columns || ROW.test(text))) {
    return { is: 'text', text, end, names: null };
  }

  const far = wordEnd(formula, end + 1);
  const other = formula.slice(end + 1, far);
  if (!(columns ? COLUMN : ROW).test(other)) return { is: 'text', text, end, names: null };

  const one = columns ? rule.column(text, of) : rule.row(text, of);
  const two = columns ? rule.column(other, of) : rule.row(other, of);
  if (one === null || two === null) return { is: 'off', word: `${text}:${other}` };

  return { is: 'text', text: `${one}:${two}`, end: far, names: null };
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
