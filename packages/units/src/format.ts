/** The most decimal places a number format is given here, well under Excel's own 30. */
export const MOST_DECIMALS = 9;

/**
 * How many decimal places a number format shows, over its first section
 * (`docs/spec.md` §6 `format:`). No format at all shows none.
 */
export function decimalsIn(code: string | null): number {
  if (code === null) return 0;

  const [first = ''] = sections(code);
  const point = pointIn(first);
  if (point < 0) return 0;

  let places = 0;
  for (const glyph of first.slice(point + 1)) {
    if (glyph !== '0' && glyph !== '#') break;
    places += 1;
  }

  return places;
}

/**
 * The same format with that many decimal places, in every section it has.
 * Where there is no format, a plain number is what they are counted from.
 */
export function withDecimals(code: string | null, places: number): string {
  const held = Math.min(Math.max(places, 0), MOST_DECIMALS);
  const parts = code === null ? ['0'] : sections(code);

  return parts.map((one) => placed(one, held)).join(';');
}

/** One section of a format, with its decimals replaced. */
function placed(section: string, places: number): string {
  const shown = places === 0 ? '' : `.${'0'.repeat(places)}`;
  const point = pointIn(section);

  if (point >= 0) {
    const after = section.slice(point + 1).replace(/^[0#?]*/, '');
    return `${section.slice(0, point)}${shown}${after}`;
  }

  // After the last digit, so that a currency sign or a unit stays where it is.
  const digit = digitIn(section);
  return digit < 0 ? section : `${section.slice(0, digit + 1)}${shown}${section.slice(digit + 1)}`;
}

/** Where a section's decimal point is, which is the last one that is not text. */
function pointIn(section: string): number {
  return lastly(section, (glyph) => glyph === '.');
}

/** Where a section's last digit stands, which is where a decimal point would go. */
function digitIn(section: string): number {
  return lastly(section, (glyph) => glyph === '0' || glyph === '#' || glyph === '?');
}

/** The last glyph of a section that is one of these and is not text. */
function lastly(section: string, is: (glyph: string) => boolean): number {
  let at = -1;
  walk(section, (glyph, where, text) => {
    if (!text && is(glyph)) at = where;
  });

  return at;
}

/** A format's sections, which Excel separates with `;`: positive, negative, zero, text. */
function sections(code: string): string[] {
  const parts: string[] = [];
  let held = '';

  walk(code, (glyph, _where, text) => {
    if (glyph === ';' && !text) {
      parts.push(held);
      held = '';
      return;
    }
    held += glyph;
  });

  parts.push(held);
  return parts;
}

/** Every glyph, said with whether it is text — inside quotes, or escaped with a `\`. */
function walk(code: string, each: (glyph: string, at: number, text: boolean) => void): void {
  let quoted = false;

  for (let at = 0; at < code.length; at += 1) {
    const glyph = code[at] ?? '';

    if (glyph === '\\') {
      each(glyph, at, true);
      if (at + 1 < code.length) each(code[at + 1] ?? '', at + 1, true);
      at += 1;
      continue;
    }
    if (glyph === '"') {
      quoted = !quoted;
      each(glyph, at, true);
      continue;
    }

    each(glyph, at, quoted);
  }
}
