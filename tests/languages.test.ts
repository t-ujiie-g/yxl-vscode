import { WORDS as cst } from '@yxl-vscode/cst';
import type { Book, Language } from '@yxl-vscode/diag';
import { WORDS as intent } from '@yxl-vscode/intent';
import { WORDS as patch } from '@yxl-vscode/patch';
import { WORDS as view } from '@yxl-vscode/webview/text';
import { describe, expect, it } from 'vitest';
import { WORDS as host } from 'yxl-vscode/text';

/**
 * Every book of sentences this editor holds, which is the list the languages
 * are held to. A package that starts saying things belongs here (ADR-051).
 */
const BOOKS: Record<string, Book> = { cst, patch, view, intent, host };

/**
 * One sentence as it is written, rather than as it reads: an argument may be
 * anything at all, so the two languages are told apart by their source.
 */
function written(book: Book, language: Language, id: string): string {
  return String(book[language][id] ?? '');
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
        (id) => written(book, 'ja', id) === written(book, 'en', id),
      );
      expect([name, same]).toEqual([name, []]);
    }
  });
});
