import { describe, expect, it } from 'vitest';
import { resolvePlain } from './scalar';

describe('resolvePlain', () => {
  it('resolves the spellings of null', () => {
    for (const source of ['~', 'null', 'Null', 'NULL', '']) {
      expect(resolvePlain(source)).toBeNull();
    }
  });

  it('resolves the spellings of a boolean', () => {
    for (const source of ['true', 'True', 'TRUE']) expect(resolvePlain(source)).toBe(true);
    for (const source of ['false', 'False', 'FALSE']) expect(resolvePlain(source)).toBe(false);
  });

  it('leaves YAML 1.1 booleans as text, as the core schema says', () => {
    for (const source of ['yes', 'no', 'on', 'off']) expect(resolvePlain(source)).toBe(source);
  });

  it('resolves integers, signed and unsigned', () => {
    expect(resolvePlain('0')).toBe(0);
    expect(resolvePlain('42')).toBe(42);
    expect(resolvePlain('-17')).toBe(-17);
    expect(resolvePlain('+17')).toBe(17);
  });

  it('resolves octal and hexadecimal', () => {
    expect(resolvePlain('0o17')).toBe(15);
    expect(resolvePlain('0x1F')).toBe(31);
  });

  it('resolves floats', () => {
    expect(resolvePlain('3.5')).toBe(3.5);
    expect(resolvePlain('-0.5')).toBe(-0.5);
    expect(resolvePlain('.5')).toBe(0.5);
    expect(resolvePlain('1e3')).toBe(1000);
    expect(resolvePlain('1.2e-3')).toBe(0.0012);
  });

  it('resolves the infinities and NaN', () => {
    expect(resolvePlain('.inf')).toBe(Number.POSITIVE_INFINITY);
    expect(resolvePlain('-.Inf')).toBe(Number.NEGATIVE_INFINITY);
    expect(resolvePlain('.nan')).toBeNaN();
  });

  it('keeps an integer too large for a double as text rather than rounding it', () => {
    expect(resolvePlain('9007199254740993')).toBe('9007199254740993');
  });

  it('keeps the whole source when an oversized integer was written in hex', () => {
    expect(resolvePlain('0xFFFFFFFFFFFFFFFF')).toBe('0xFFFFFFFFFFFFFFFF');
  });

  it('resolves a leading-zero number as an integer — a product code has to be quoted', () => {
    expect(resolvePlain('007')).toBe(7);
  });

  it('leaves anything else as text', () => {
    expect(resolvePlain('APAC')).toBe('APAC');
    expect(resolvePlain('2026-08-14')).toBe('2026-08-14');
    expect(resolvePlain('A1:B2')).toBe('A1:B2');
  });
});
