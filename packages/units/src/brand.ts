/**
 * A nominal type over a primitive: a `Brand<string, 'A1Addr'>` goes wherever a
 * `string` goes, and a `string` does not go where it goes.
 *
 * The only values are the ones this package's `parse` functions return, so a
 * branded value is one that has been checked, and two arguments of the same
 * underlying type cannot be swapped without the compiler saying so.
 */
export type Brand<T, Tag extends string> = T & { readonly __brand: Tag };
