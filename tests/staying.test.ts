// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cell, drawing, sheet, shown } from '../packages/webview/src/harness';
import { REPO_ROOT } from './corpus';

/**
 * The one suite that loads `view.css`. What stays put while the rest scrolls is
 * decided by `position` and `z-index` and by nothing the DOM says, so a suite
 * that never loads the stylesheet cannot see a heading come unstuck.
 */
const CSS = readFileSync(join(REPO_ROOT, 'packages/webview/src/view.css'), 'utf8');

/** A sheet with both of the things that stay: a column outline's gutter, and a freeze. */
function styled(): HTMLElement {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const widths = [{ first: 4, last: 5, size: null, hidden: false, group: 1 }];
  const one = sheet({ freeze: { row: 3, col: 2 }, widths, cells: [cell(1, 1), cell(2, 1)] });
  return shown({ drawing: drawing({ sheets: [one] }) });
}

/** Every cell that has to stay put: the headings, gutter and letters alike, and the frozen band. */
function staying(into: HTMLElement): HTMLElement[] {
  return [...into.querySelectorAll<HTMLElement>('thead th, thead td, tbody tr.frozen > *')];
}

const named = (at: Element): string => `${at.tagName}.${at.className}`;

describe('what has to stay put while the rest scrolls', () => {
  it('draws the rows this is about: two of headings, and the frozen band', () => {
    const into = styled();
    expect(into.querySelectorAll('thead tr').length).toBe(2);
    expect(into.querySelectorAll('tbody tr.frozen').length).toBe(2);
  });

  it('sticks every one of them — the outline gutter as much as the letters', () => {
    const loose = staying(styled()).filter((at) => getComputedStyle(at).position !== 'sticky');
    expect(loose.map(named)).toEqual([]);
  });

  it('gives every one of them a ground of its own, or the sheet shows through it', () => {
    const blank = new Set(['', 'transparent', 'rgba(0, 0, 0, 0)']);
    const clear = staying(styled()).filter((at) => blank.has(getComputedStyle(at).backgroundColor));
    expect(clear.map(named)).toEqual([]);
  });
});
