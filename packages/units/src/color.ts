import type { Brand } from './brand';

/** A colour exactly as the spec wrote it: leading `#` and case both survive. */
export type Color = Brand<string, 'Color'>;

const HEX = /^#?(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

/**
 * Read a hex colour, or `null`. Six digits or eight, `#` optional — what yxl's
 * reader accepts, though `docs/spec.md` documents only `RRGGBB`.
 */
export function parseColor(text: string): Color | null {
  return HEX.test(text) ? (text as Color) : null;
}

/**
 * A colour as a screen paints it: `#RRGGBB`, with the alpha byte of an
 * `AARRGGBB` spelling dropped — Excel ignores it, and a `00` there is opaque
 * black to Excel and invisible to CSS.
 */
export function painted(color: Color | string): string {
  const digits = color.startsWith('#') ? color.slice(1) : color;
  return `#${digits.length === 8 ? digits.slice(2) : digits}`;
}
