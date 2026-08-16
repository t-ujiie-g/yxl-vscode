/**
 * What the reader meant by what they typed.
 *
 * YAML's own reading of a bare scalar, which is what the spec would give the
 * same text: `42` is a number, `true` is a boolean, and an empty box is a cell
 * with nothing in it.
 */
export function meant(typed: string): string | number | boolean | null {
  if (typed === '') return null;
  if (typed === 'true' || typed === 'false') return typed === 'true';

  const number = Number(typed);
  return typed.trim() !== '' && Number.isFinite(number) ? number : typed;
}
