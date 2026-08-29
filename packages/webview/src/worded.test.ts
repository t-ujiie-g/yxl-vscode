// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { worded } from './worded';

describe('what the core said, worded on the page', () => {
  it('reads in the language the page is drawn in', () => {
    document.documentElement.lang = 'ja';
    expect(worded({ id: 'cst.cannot-remove-root', args: {} })).toBe(
      'ドキュメントのルートは削除できません',
    );

    document.documentElement.lang = 'en';
    expect(worded({ id: 'cst.cannot-remove-root', args: {} })).toBe(
      'the document root cannot be removed',
    );
  });
});
