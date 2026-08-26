import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function loaded(body: string) {
  return load(parse(`sheets:\n  - name: S\n    sparklines:\n${body}`, { file: 'spec.yxl.yaml' }));
}

function codes(body: string): string[] {
  return loaded(body).diagnostics.map((diagnostic) => diagnostic.code);
}

function group(body: string) {
  const one = loaded(body).doc?.sheets[0]?.sparklines[0];
  if (one === undefined) throw new Error('no sparkline group loaded');
  return one;
}

describe('a sparkline group', () => {
  it('reads one placed by its own `at` and `data`', () => {
    const one = group('      - at: F2\n        data: B2:E2\n        color: "1F77B4"\n');
    expect(one.cells).toEqual([{ at: 'F2', data: 'B2:E2' }]);
    expect(one.color).toBe('1F77B4');
  });

  it('reads several placed by `cells`, each keeping its own range', () => {
    const one = group(
      '      - cells:\n          - { at: G2, data: Results!B2:E2 }\n          - { at: G3, data: Results!B3:E3 }\n        type: win_loss\n',
    );
    expect(one.cells).toEqual([
      { at: 'G2', data: 'Results!B2:E2' },
      { at: 'G3', data: 'Results!B3:E3' },
    ]);
    expect(one.type).toBe('win_loss');
  });

  it('is a line, with no marks and no axis, unless the spec says otherwise', () => {
    const one = group('      - at: F2\n        data: B2:E2\n');
    expect([one.type, one.markers, one.high, one.low, one.axis]).toEqual([
      'line',
      false,
      false,
      false,
      false,
    ]);
    expect([one.min, one.max, one.weight, one.color, one.colors]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('reads the bounds, the weight, and the colours of the marks it picks out', () => {
    const one = group(
      '      - at: F2\n        data: B2:E2\n        markers: true\n        high: true\n        low: true\n        axis: true\n        min: 0\n        max: 10\n        weight: 1.5\n        colors: { markers: "111111", high: "222222" }\n',
    );
    expect([one.markers, one.high, one.low, one.axis]).toEqual([true, true, true, true]);
    expect([one.min, one.max, one.weight]).toEqual([0, 10, 1.5]);
    expect(one.colors).toEqual({ markers: '111111', high: '222222', low: null });
  });

  it('refuses a group placed twice', () => {
    const both =
      '      - at: F2\n        data: B2:E2\n        cells:\n          - { at: G2, data: B2:E2 }\n';
    expect(codes(both)).toContain(CODE.conflictingKeys);
  });

  it('needs somewhere to sit and something to plot', () => {
    expect(codes('      - data: B2:E2\n')).toContain(CODE.missingKey);
    expect(codes('      - at: F2\n')).toContain(CODE.missingKey);
    expect(codes('      - cells: []\n')).toContain(CODE.missingKey);
  });

  it('refuses a kind Excel does not plot, and a key a group does not have', () => {
    expect(codes('      - at: F2\n        data: B2:E2\n        type: pie\n')).toContain(
      CODE.unknownSpelling,
    );
    expect(codes('      - at: F2\n        data: B2:E2\n        first: true\n')).toContain(
      CODE.unknownKey,
    );
  });
});
