import type { Brand } from './brand';

/** One cell reference as a spec writes it — `A1`, `AA10`: no `$`, no sheet. */
export type A1Addr = Brand<string, 'A1Addr'>;

/** Two cell references around a colon (`A1:B9`), corners kept in the order written. */
export type A1Range = Brand<string, 'A1Range'>;

const ADDR = /^[A-Z]+0*[1-9][0-9]*$/;

/**
 * Read a cell reference, or `null`. As permissive as yxl's own reader, a padded
 * row (`A01`) included — refusing what the compiler accepts would leave a spec
 * that builds unopenable here.
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
