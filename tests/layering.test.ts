import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './corpus';

const css = readFileSync(join(REPO_ROOT, 'packages', 'webview', 'src', 'view.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** The `z-index` the stylesheet gives exactly this selector. */
function level(selector: string): number {
  for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = (rule[1] ?? '').split(',').map((one) => one.trim());
    const said = /z-index:\s*(\d+)/.exec(rule[2] ?? '');
    if (said !== null && selectors.includes(selector)) return Number(said[1]);
  }
  throw new Error(`no z-index for ${selector}`);
}

describe('the order sticky cells paint in (#191)', () => {
  it('puts each band that stays in front of another on a level of its own', () => {
    const ladder = [
      '.spill',
      '.grid td.stays',
      '.grid td.stays.spilling',
      '.grid tbody th',
      '.grid tr.frozen td',
      '.grid tr.frozen td.spilling',
      '.grid tr.frozen td.stays',
      '.grid tr.frozen td.stays.spilling',
      '.grid tr.frozen th',
      '.typing',
      '.grid thead th',
      '.grid thead th.stays',
      '.grid thead th.corner',
    ].map(level);

    expect(ladder).toEqual([...ladder].sort((one, other) => one - other));
    expect(new Set(ladder).size).toBe(ladder.length);
  });

  it("puts each pane's floats over that pane's cells and under the panes in front of it", () => {
    const panes = [
      ['.scroller .pane', '.spill', '.grid td.stays'],
      ['.scroller .pane.columns', '.grid td.stays.spilling', '.grid tr.frozen td'],
      ['.scroller .pane.rows', '.grid tr.frozen td.spilling', '.grid tr.frozen td.stays'],
      ['.scroller .pane.corner', '.grid tr.frozen td.stays.spilling', '.grid tr.frozen th'],
    ];

    for (const [pane = '', over = '', under = ''] of panes) {
      expect([pane, level(pane) >= level(over), level(pane) < level(under)]).toEqual([
        pane,
        true,
        true,
      ]);
    }
  });

  it('keeps a note corner under a frozen column', () => {
    expect(level('.grid td .noted')).toBeLessThan(level('.grid td.stays'));
    expect(level('.grid thead td.outline.stays')).toBe(level('.grid thead th.stays'));
  });
});

describe('the outline gutter', () => {
  it('keeps every outline cell sticky, where `relative` would move a lower level down by its own `top`', () => {
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const outline = (rule[1] ?? '').includes('.outline');
      if (outline) expect(rule[2] ?? '', rule[1]).not.toMatch(/position:\s*relative/);
    }
  });

  it('draws the group control big enough to hit, as Google Sheets does', () => {
    const control = /\.grid button\.grouping\.control \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(control).toMatch(/width: 16px/);
    expect(control).toMatch(/height: 16px/);
  });
});
