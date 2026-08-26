import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** How big a picture is, in pixels, before a `scale:` is applied to it. */
export interface Natural {
  readonly width: number;
  readonly height: number;
}

/**
 * A picture's own size, read from the file's header rather than decoded: the
 * preview needs the extent an image takes, never its pixels (ADR-029). `null`
 * where the file cannot be read or is a format whose header this does not know.
 */
export type PictureReader = (from: string, path: string) => Natural | null;

/** How much of a file the headers below can need; a JPEG's frame can sit past its thumbnail. */
const HEAD = 256 * 1024;

export const measureBeside: PictureReader = (from, path) => {
  const found = resolve(dirname(from), path.replace(/\\/g, '/'));

  let bytes: Buffer;
  try {
    bytes = readFileSync(found);
  } catch {
    return null;
  }

  return naturalSize(bytes.subarray(0, HEAD));
};

/**
 * The size a picture's own header declares: PNG, GIF, BMP, JPEG and SVG. The
 * rest of `docs/spec.md` §13's formats are `null` — Excel will place them, and
 * the preview says it does not know how big.
 */
export function naturalSize(bytes: Uint8Array): Natural | null {
  return png(bytes) ?? gif(bytes) ?? bmp(bytes) ?? jpeg(bytes) ?? svg(bytes);
}

function starts(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, at) => bytes[at] === byte);
}

function beU16(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
}

function beU32(bytes: Uint8Array, at: number): number {
  return beU16(bytes, at) * 0x10000 + beU16(bytes, at + 2);
}

function leU16(bytes: Uint8Array, at: number): number {
  return (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
}

function leU32(bytes: Uint8Array, at: number): number {
  return leU16(bytes, at) + leU16(bytes, at + 2) * 0x10000;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function png(bytes: Uint8Array): Natural | null {
  if (bytes.length < 24 || !starts(bytes, PNG)) return null;
  return sized(beU32(bytes, 16), beU32(bytes, 20));
}

function gif(bytes: Uint8Array): Natural | null {
  if (bytes.length < 10 || !starts(bytes, [0x47, 0x49, 0x46])) return null;
  return sized(leU16(bytes, 6), leU16(bytes, 8));
}

function bmp(bytes: Uint8Array): Natural | null {
  if (bytes.length < 26 || !starts(bytes, [0x42, 0x4d])) return null;
  // A BMP's height is signed: a negative one is the same picture, stored top-down.
  const height = leU32(bytes, 22);
  return sized(leU32(bytes, 18), height > 0x7fffffff ? 0x100000000 - height : height);
}

/** The markers that carry no payload, which are stepped over rather than skipped by a length. */
const BARE = new Set([0xd8, 0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);

/** The frame headers, which are every `SOF` marker; `C4`, `C8` and `CC` are not frames. */
function isFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function jpeg(bytes: Uint8Array): Natural | null {
  if (bytes.length < 4 || !starts(bytes, [0xff, 0xd8])) return null;

  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (BARE.has(marker)) {
      at += 2;
      continue;
    }
    if (isFrame(marker)) return sized(beU16(bytes, at + 7), beU16(bytes, at + 5));

    at += 2 + beU16(bytes, at + 2);
  }
  return null;
}

const LENGTH = /^\s*([0-9.]+)\s*(px|pt|pc|in|cm|mm)?\s*$/;

/** CSS lengths as pixels, at the 96dpi an SVG is read at; a percentage says nothing about the extent. */
const PER_UNIT: Record<string, number> = {
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
};

function svg(bytes: Uint8Array): Natural | null {
  const source = Buffer.from(bytes).toString('utf8');
  const opened = /<svg\b[^>]*>/i.exec(source);
  if (opened === null) return null;

  const tag = opened[0];
  const width = length(attribute(tag, 'width'));
  const height = length(attribute(tag, 'height'));
  if (width !== null && height !== null) return sized(width, height);

  const box =
    attribute(tag, 'viewBox')
      ?.trim()
      .split(/[\s,]+/) ?? [];
  return box.length === 4 ? sized(Number(box[2]), Number(box[3])) : null;
}

function attribute(tag: string, name: string): string | null {
  const found = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`, 'i').exec(
    tag,
  );
  return found === null ? null : (found[1] ?? found[2] ?? null);
}

function length(said: string | null): number | null {
  if (said === null) return null;

  const read = LENGTH.exec(said);
  if (read === null) return null;

  return Number(read[1]) * (PER_UNIT[read[2] ?? 'px'] ?? 1);
}

function sized(width: number, height: number): Natural | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return width > 0 && height > 0 ? { width: Math.round(width), height: Math.round(height) } : null;
}
