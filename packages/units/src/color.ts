import type { Brand } from './brand';

/**
 * A colour exactly as the spec wrote it — a leading `#` and the author's own
 * case both survive.
 *
 * yxl canonicalizes to uppercase hex on the way into a workbook and nothing
 * here needs to: this editor writes specs back, and a value it did not change
 * must not change.
 */
export type Color = Brand<string, 'Color'>;

const HEX = /^#?(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

/**
 * Read a hex colour, or `null` when the text is not one.
 *
 * Six digits are `RRGGBB` and eight are `AARRGGBB` — both widths, and the
 * optional `#`, are what yxl's reader accepts, though `docs/spec.md` documents
 * only the six-digit form.
 */
export function parseColor(text: string): Color | null {
  return HEX.test(text) ? (text as Color) : null;
}
