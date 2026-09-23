import type { CompiledName } from '@yxl-vscode/compile';
import { addrAt, sheetSpelled } from '@yxl-vscode/units';

/** Each defined name, compared without case as Excel compares them, by the absolute range it refers to. */
export function refersTo(names: readonly CompiledName[]): ReadonlyMap<string, string> {
  return new Map(
    names.map((one) => {
      const from = absolute(one.rect.left, one.rect.top);
      const to = absolute(one.rect.right, one.rect.bottom);
      return [one.name.toLowerCase(), `${sheetSpelled(one.sheet)}!${from}:${to}`];
    }),
  );
}

function absolute(col: number, row: number): string {
  return addrAt({ col, row }).replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2');
}

/**
 * A formula with every defined name it uses spelled as the range it refers to,
 * which the engine reads where it cannot read a name. Text in quotes, a
 * function's name and a table's column are left as written.
 */
export function spelledOut(formula: string, names: ReadonlyMap<string, string>): string {
  if (names.size === 0) return formula;

  let out = '';
  let at = 0;
  while (at < formula.length) {
    const char = formula.charAt(at);
    if (char === '"' || char === "'") {
      const end = closing(formula, at, char);
      out += formula.slice(at, end);
      at = end;
      continue;
    }
    if (char === '[') {
      const end = formula.indexOf(']', at);
      const next = end < 0 ? formula.length : end + 1;
      out += formula.slice(at, next);
      at = next;
      continue;
    }
    if (!startsName(char) || continuesName(formula.charAt(at - 1))) {
      out += char;
      at += 1;
      continue;
    }

    let end = at + 1;
    while (end < formula.length && continuesName(formula.charAt(end))) end += 1;
    const word = formula.slice(at, end);
    const after = formula.charAt(end);
    const range = names.get(word.toLowerCase());
    const used = range !== undefined && after !== '(' && after !== '!' && after !== '[';
    out += used ? range : word;
    at = end;
  }
  return out;
}

/** The index after a quoted run ends, a doubled quote being the quote itself. */
function closing(formula: string, from: number, quote: string): number {
  let at = from + 1;
  while (at < formula.length) {
    if (formula.charAt(at) !== quote) {
      at += 1;
      continue;
    }
    if (formula.charAt(at + 1) !== quote) return at + 1;
    at += 2;
  }
  return formula.length;
}

function startsName(char: string): boolean {
  return /[A-Za-z_\\]/.test(char) || char > '\x7f';
}

function continuesName(char: string): boolean {
  return char !== '' && (/[A-Za-z0-9_.$]/.test(char) || char > '\x7f');
}
