import type { Brand } from './brand';

/**
 * One cell reference in the form a spec writes it — `A1`, `AA10`: uppercase
 * column letters followed by a row of at least 1, with no `$` and no sheet
 * qualifier.
 */
export type A1Addr = Brand<string, 'A1Addr'>;

/**
 * Two cell references around a colon (`A1:B9`).
 *
 * The corners are kept as written: a spec may give them in any order, and
 * putting them in reading order is the compiler's business, not the reader's.
 */
export type A1Range = Brand<string, 'A1Range'>;

const ADDR = /^[A-Z]+0*[1-9][0-9]*$/;

/**
 * Read a cell reference, or `null` when the text is not one — a caller turns
 * that into a diagnostic, which is where the wording belongs.
 *
 * As permissive as yxl's own reader, a padded row (`A01`) included: refusing
 * something the compiler accepts would leave this editor unable to open a spec
 * that builds.
 */
export function parseA1Addr(text: string): A1Addr | null {
  return ADDR.test(text) ? (text as A1Addr) : null;
}

/** Read a range, or `null` when either corner is not a cell reference. */
export function parseA1Range(text: string): A1Range | null {
  const colon = text.indexOf(':');
  if (colon < 0) return null;
  if (parseA1Addr(text.slice(0, colon)) === null) return null;
  if (parseA1Addr(text.slice(colon + 1)) === null) return null;
  return text as A1Range;
}
