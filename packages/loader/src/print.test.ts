import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function loaded(key: string, body: string) {
  return load(parse(`sheets:\n  - name: S\n    ${key}:\n${body}`, { file: 'spec.yxl.yaml' }));
}

function codes(key: string, body: string): string[] {
  return loaded(key, body).diagnostics.map((diagnostic) => diagnostic.code);
}

function print(body: string) {
  const one = loaded('print', body).doc?.sheets[0]?.print;
  if (one === undefined || one === null) throw new Error('no print setup loaded');
  return one;
}

function protect(body: string) {
  const one = loaded('protect', body).doc?.sheets[0]?.protect;
  if (one === undefined || one === null) throw new Error('no protection loaded');
  return one;
}

describe("a sheet's print setup", () => {
  it('reads the area, the way round, the margins and the running heads', () => {
    const one = print(
      '      area: A1:D50\n      orientation: landscape\n      margins: { top: 1, left: 0.7 }\n      header: "&CQuarterly"\n      footer: "&LPage &P"\n',
    );
    expect(one.area).toBe('A1:D50');
    expect(one.orientation).toBe('landscape');
    expect(one.margins).toEqual({
      top: 1,
      bottom: null,
      left: 0.7,
      right: null,
      header: null,
      footer: null,
    });
    expect([one.header, one.footer]).toEqual(['&CQuarterly', '&LPage &P']);
  });

  it('reads the two halves of the scaling control, one at a time', () => {
    expect(print('      scale: 80\n').scale).toBe(80);
    expect(print('      fit: { width: 1, height: 0 }\n').fit).toEqual({ width: 1, height: 0 });
  });

  it('refuses a spec that scales both ways at once', () => {
    const both = '      scale: 80\n      fit: { width: 1 }\n';
    expect(codes('print', both)).toContain(CODE.conflictingKeys);
  });

  it('reads the cells a page starts at, and refuses one at `A1`, which breaks nothing', () => {
    expect(print('      breaks: [A21, C1]\n').breaks).toEqual(['A21', 'C1']);
    expect(codes('print', '      breaks: [A1]\n')).toContain(CODE.conflictingKeys);
  });

  it('says nothing about what the spec leaves out', () => {
    const one = print('      area: A1:B2\n');
    expect([one.orientation, one.margins, one.scale, one.fit, one.header, one.footer]).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(one.breaks).toEqual([]);
  });

  it('refuses a way round the paper does not go, and a key print does not have', () => {
    expect(codes('print', '      orientation: sideways\n')).toContain(CODE.unknownSpelling);
    expect(codes('print', '      copies: 2\n')).toContain(CODE.unknownKey);
  });
});

describe("a sheet's protection", () => {
  it('reads the password and what is still allowed', () => {
    const one = protect(
      '      password: hunter2\n      allow: { sort: true, auto_filter: true }\n',
    );
    expect(one.password).toBe('hunter2');
    expect(one.allow).toEqual({ sort: true, auto_filter: true });
  });

  it('allows nothing beyond selecting where the spec names nothing', () => {
    const one = protect('      password: hunter2\n');
    expect(one.allow).toEqual({});
  });

  it('keeps an allowance the spec turns off, which is not the same as leaving it out', () => {
    expect(protect('      allow: { select_locked_cells: false }\n').allow).toEqual({
      select_locked_cells: false,
    });
  });

  it('refuses a misspelt allowance rather than keeping one that would never apply', () => {
    expect(codes('protect', '      allow: { sorting: true }\n')).toContain(CODE.unknownKey);
  });
});
