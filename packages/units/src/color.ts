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
