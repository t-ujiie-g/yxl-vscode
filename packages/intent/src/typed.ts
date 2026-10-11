/**
 * What the reader meant by what they typed: a formula (a leading `=`, as in
 * Excel), a value, or the cell emptied — which is not a value, since a cell
 * holding nothing is not something the format can say (`docs/spec.md` §3).
 */
export type Meaning =
  | { readonly is: 'formula'; readonly body: string }
  | { readonly is: 'value'; readonly value: string | number | boolean }
  | { readonly is: 'empty' };

export function meaning(typed: string): Meaning {
  if (typed === '') return { is: 'empty' };
  if (typed.startsWith('=')) return { is: 'formula', body: typed.slice(1) };

  return { is: 'value', value: meant(typed) };
}

/** A value as Excel reads one typed in: decimal digits are a number, `TRUE` in any case a truth value (#205). */
function meant(typed: string): string | number | boolean {
  const word = typed.trim().toUpperCase();
  if (word === 'TRUE' || word === 'FALSE') return word === 'TRUE';

  const number = DECIMAL.test(typed.trim()) ? Number(typed) : Number.NaN;
  return Number.isFinite(number) ? number : typed;
}

/** Excel's own notation for a number: no `0x`, `0o` or `0b`, and no `Infinity`. */
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;
