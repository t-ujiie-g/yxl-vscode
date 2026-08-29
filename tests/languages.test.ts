import { WORDS as cst } from '@yxl-vscode/cst';
import type { Book, Language } from '@yxl-vscode/diag';
import { WORDS as patch } from '@yxl-vscode/patch';
import { describe, expect, it } from 'vitest';

/**
 * Every book of sentences this editor holds, which is the list the languages
 * are held to. A package that starts saying things belongs here (ADR-051).
 */
const BOOKS: Record<string, Book> = { cst, patch };

/** One sentence read with its own argument names in place of arguments, which is enough to tell two languages apart. */
function read(book: Book, language: Language, id: string): string {
  const sentence = book[language][id];
  const args = new Proxy({}, { get: (_held, name) => String(name) });
  return sentence === undefined ? '' : (sentence as (args: unknown) => string)(args);
}

describe('the languages this editor reads in', () => {
  it('says the same list in both, so neither can quietly fall behind', () => {
    for (const [name, book] of Object.entries(BOOKS)) {
      expect([name, Object.keys(book.ja).sort()]).toEqual([name, Object.keys(book.en).sort()]);
    }
  });

  it('names every sentence for the package that says it', () => {
    for (const [name, book] of Object.entries(BOOKS)) {
      expect(Object.keys(book.en).filter((id) => !id.startsWith(`${name}.`))).toEqual([]);
    }
  });

  it('has a Japanese sentence that is not the English one, which is what a copied line looks like', () => {
    for (const [name, book] of Object.entries(BOOKS)) {
      const same = Object.keys(book.en).filter(
        (id) => read(book, 'ja', id) === read(book, 'en', id),
      );
      expect([name, same]).toEqual([name, []]);
    }
  });
});
