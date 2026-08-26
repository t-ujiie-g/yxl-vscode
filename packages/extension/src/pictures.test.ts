import { describe, expect, it } from 'vitest';
import { measureBeside, naturalSize } from './pictures';

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function gif(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(10);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

function bmp(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(26);
  bytes.set([0x42, 0x4d]);
  const view = new DataView(bytes.buffer);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  return bytes;
}

/** A JPEG down to its first frame header: the marker, its length, the precision, then height and width. */
function jpeg(width: number, height: number): Uint8Array {
  const head = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const frame = [0xff, 0xc0, 0x00, 0x11, 0x08];
  const bytes = new Uint8Array([...head, ...frame, 0, 0, 0, 0]);
  const view = new DataView(bytes.buffer);
  view.setUint16(head.length + 5, height);
  view.setUint16(head.length + 7, width);
  return bytes;
}

const text = (source: string): Uint8Array => new TextEncoder().encode(source);

describe('naturalSize', () => {
  it('reads a PNG, a GIF, a BMP and a JPEG out of their headers', () => {
    expect(naturalSize(png(120, 45))).toEqual({ width: 120, height: 45 });
    expect(naturalSize(gif(64, 32))).toEqual({ width: 64, height: 32 });
    expect(naturalSize(bmp(200, 100))).toEqual({ width: 200, height: 100 });
    expect(naturalSize(jpeg(300, 150))).toEqual({ width: 300, height: 150 });
  });

  it('takes a BMP stored top-down, whose height is written negative, as the same picture', () => {
    expect(naturalSize(bmp(200, -100))).toEqual({ width: 200, height: 100 });
  });

  it('reads an SVG from its width and height, in whatever unit they are written', () => {
    expect(naturalSize(text('<svg width="40" height="20"></svg>'))).toEqual({
      width: 40,
      height: 20,
    });
    expect(naturalSize(text('<svg width="1in" height="72pt"/>'))).toEqual({
      width: 96,
      height: 96,
    });
  });

  it('falls back to an SVG viewBox where the two attributes are a percentage or absent', () => {
    expect(naturalSize(text('<svg viewBox="0 0 300 150"/>'))).toEqual({ width: 300, height: 150 });
    expect(naturalSize(text('<svg width="100%" viewBox="0 0 10 5"/>'))).toEqual({
      width: 10,
      height: 5,
    });
  });

  it('says nothing of a format whose header this does not read, or of a size of nothing', () => {
    expect(naturalSize(text('MM and then a TIFF'))).toBeNull();
    expect(naturalSize(png(0, 45))).toBeNull();
    expect(naturalSize(new Uint8Array(0))).toBeNull();
  });
});

describe('measureBeside', () => {
  it('says nothing where the file is not there to read', () => {
    expect(measureBeside('/nowhere/spec.yxl.yaml', 'assets/logo.png')).toBeNull();
  });
});
