import { type A1Addr, parseA1Addr } from './a1';
import { type SheetName, sheetName } from './name';

/**
 * A cell named together with the sheet it sits on — `Sales!E37` — which is how
 * a construct outside any sheet, an override, has to say where it lands.
 */
export interface QualifiedAddr {
  readonly sheet: SheetName;
  readonly at: A1Addr;
}

/**
 * A cell named with its sheet, in the spelling everything here reads back.
 *
 * One convention, in the package that owns addresses: a computed value, a
 * changed cell, and an override's `at:` all name a cell the same way, and
 * `parseQualifiedAddr` is the other half of this function.
 */
export function qualified(sheet: SheetName, at: A1Addr): string {
  return `${sheet}!${at}`;
}

/**
 * Read a sheet-qualified cell reference, in either of Excel's two spellings:
 * bare (`Sales!E37`), or quoted where the name needs it (`'Q3 data'!A1`, an
 * apostrophe inside written `''`).
 *
 * The sheet is required and the reference is one cell: a range is refused, so
 * an override cannot quietly become a second way to style a region.
 */
export function parseQualifiedAddr(text: string): QualifiedAddr | null {
  const split = text.startsWith("'") ? quoted(text) : plain(text);
  if (split === null) return null;

  const sheet = sheetName(split.name);
  const at = parseA1Addr(split.rest);
  return sheet === null || at === null ? null : { sheet, at };
}

/** Excel quotes any sheet name that could be read as something else, so the first `!` divides. */
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
