/**
 * A nominal type over a primitive: a `Brand<string, 'A1Addr'>` goes wherever a
 * `string` goes, and a `string` does not go where it goes. Only this package's
 * `parse` functions make one, so a branded value has been checked.
 */
export type Brand<T, Tag extends string> = T & { readonly __brand: Tag };
