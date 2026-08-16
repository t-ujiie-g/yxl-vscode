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

/** A bare scalar as YAML reads one: `42` is a number, `true` a boolean. */
function meant(typed: string): string | number | boolean {
  if (typed === 'true' || typed === 'false') return typed === 'true';

  const number = Number(typed);
  return typed.trim() !== '' && Number.isFinite(number) ? number : typed;
}
