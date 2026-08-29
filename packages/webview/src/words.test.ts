import { describe, expect, it } from 'vitest';
import { reader, spoken } from './words';

describe('the language a page reads in', () => {
  it('takes Japanese from the tag VS Code sets, however it is written', () => {
    expect(spoken('ja')).toBe('ja');
    expect(spoken('ja-JP')).toBe('ja');
    expect(spoken('JA')).toBe('ja');
  });

  it('reads in English for every other language, which is what this editor has', () => {
    expect(spoken('en')).toBe('en');
    expect(spoken('zh-cn')).toBe('en');
    expect(spoken('')).toBe('en');
  });

  it('holds what the core says, in both languages', () => {
    const message = { id: 'cst.key-exists', args: { key: 'A1' } };
    expect(reader('en')(message)).toBe('`A1` is already there');
    expect(reader('ja')(message)).toBe('`A1` はすでにあります');
  });
});
