import { describe, expect, it } from 'vitest';
import type { Book, Nothing, Words } from './words';
import { reading, speaking } from './words';

type Says = {
  'test.named': { name: string };
  'test.bare': Nothing;
};

const say = speaking<Says>();

const en: Words<Says> = {
  'test.named': ({ name }) => `nothing is named ${name}`,
  'test.bare': () => 'nothing at all',
};

const ja: Words<Says> = {
  'test.named': ({ name }) => `${name} という名前のものはありません`,
  'test.bare': () => '何もありません',
};

const BOOK: Book = { en, ja };

describe('what the core says, read in a language', () => {
  it('carries the id and its parts rather than the sentence', () => {
    expect(say('test.named', { name: 'S' })).toEqual({
      id: 'test.named',
      args: { name: 'S' },
    });
    expect(say('test.bare')).toEqual({ id: 'test.bare', args: {} });
  });

  it('reads the same message in either language', () => {
    const message = say('test.named', { name: 'S' });
    expect(reading('en', BOOK)(message)).toBe('nothing is named S');
    expect(reading('ja', BOOK)(message)).toBe('S という名前のものはありません');
  });

  it('falls back to English where a language has no sentence for the id', () => {
    const half: Book = { en, ja: { 'test.bare': ja['test.bare'] } };
    expect(reading('ja', half)(say('test.named', { name: 'S' }))).toBe('nothing is named S');
    expect(reading('ja', half)(say('test.bare'))).toBe('何もありません');
  });

  it('reads an id no book holds as itself, rather than as nothing at all', () => {
    expect(reading('en', BOOK)({ id: 'test.unwritten', args: {} })).toBe('test.unwritten');
  });

  it('passes prose through, for a site the pass to messages has not reached', () => {
    expect(reading('ja', BOOK)('written where it went wrong')).toBe('written where it went wrong');
  });

  it('reads from every book it is given', () => {
    const other: Book = { en: { 'other.one': () => 'one' }, ja: { 'other.one': () => 'いち' } };
    expect(reading('ja', BOOK, other)({ id: 'other.one', args: {} })).toBe('いち');
  });
});
