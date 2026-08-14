/**
 * A YAML scalar as the spec's own types give it (`docs/spec.md` §3): a bare
 * `007` is the number seven and a quoted `"007"` is text, and that distinction
 * is already made by the time a value reaches here.
 */
export type ScalarValue = string | number | boolean | null;
