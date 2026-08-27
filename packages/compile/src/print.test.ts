import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { codes, sheet } from './harness';

const SHEET = 'sheets:\n  - name: Figures\n';

describe('a compiled print setup', () => {
  it('reads the area as a rectangle and the breaks as the cells they name', () => {
    const source = `${SHEET}    print:\n      area: A1:D50\n      breaks: [A21, C1]\n      orientation: landscape\n      scale: 80\n`;
    const one = sheet(source).print;
    expect(one?.area).toEqual({ top: 1, left: 1, bottom: 50, right: 4 });
    expect(one?.breaks).toEqual([
      { row: 21, col: 1 },
      { row: 1, col: 3 },
    ]);
    expect([one?.orientation, one?.scale]).toEqual(['landscape', 80]);
  });

  it('takes the way round from a parameter, and refuses one that is neither', () => {
    const set = `params:\n  way: portrait\n${SHEET}    print:\n      orientation: \${way}\n`;
    expect(sheet(set).print?.orientation).toBe('portrait');

    const bad = `params:\n  way: sideways\n${SHEET}    print:\n      orientation: \${way}\n`;
    expect(codes(bad)).toContain(CODE.badSpelling);
    expect(sheet(bad).print?.orientation).toBeNull();
  });

  it('refuses an area that is not a range, and draws no outline for it', () => {
    const bad = `params:\n  where: nowhere\n${SHEET}    print:\n      area: \${where}\n`;
    expect(codes(bad)).toContain(CODE.badRange);
    expect(sheet(bad).print?.area).toBeNull();
  });
});
