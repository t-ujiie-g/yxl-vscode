/**
 * What the reader meant by what they typed into a cell.
 *
 * The three answers a spreadsheet has: a formula, a value, or the cell emptied.
 * A leading `=` makes it a formula, as it does in Excel and in every sheet a
 * reader has used, and the spec's own `value:` and `formula:` are the same
 * distinction (`docs/spec.md` §3). An empty box is not a value — a cell holding
 * nothing is not something the format can say — so it is an answer of its own.
 *
 * Read here and nowhere else: a rule about what a keystroke means, applied in
 * two places, is a rule that will be applied two ways.
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

/**
 * A bare scalar as YAML reads one, which is what the spec would make of the
 * same text: `42` is a number and `true` is a boolean.
 */
function meant(typed: string): string | number | boolean {
  if (typed === 'true' || typed === 'false') return typed === 'true';

  const number = Number(typed);
  return typed.trim() !== '' && Number.isFinite(number) ? number : typed;
}
