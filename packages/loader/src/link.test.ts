import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function loaded(body: string) {
  return load(parse(`sheets:\n  - name: S\n    links:\n${body}`, { file: 'spec.yxl.yaml' }));
}

function links(body: string) {
  return (loaded(body).doc?.sheets[0]?.links ?? []).map((link) => ({
    at: link.at,
    target: link.target,
    tip: link.tip,
  }));
}

function codes(body: string): string[] {
  return loaded(body).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('a link', () => {
  it('is a target outside the workbook where it is written bare', () => {
    expect(links('      A2: https://example.com/orders/1001\n')).toEqual([
      { at: 'A2', target: { kind: 'url', text: 'https://example.com/orders/1001' }, tip: null },
    ]);
  });

  it('goes inside the workbook only where `to` says so, never by how it reads', () => {
    expect(links('      B1: { to: "Statuses!A1", tip: The statuses }\n')).toEqual([
      { at: 'B1', target: { kind: 'to', text: 'Statuses!A1' }, tip: 'The statuses' },
    ]);
    expect(links('      B1: "Statuses!A1"\n')).toEqual([
      { at: 'B1', target: { kind: 'url', text: 'Statuses!A1' }, tip: null },
    ]);
  });

  it('keeps an address a parameter fills in', () => {
    expect(links('      "${where}": https://example.com\n')).toEqual([
      {
        at: { kind: 'template', text: '${where}' },
        target: { kind: 'url', text: 'https://example.com' },
        tip: null,
      },
    ]);
  });

  it('needs an address, exactly one target, and no key of its own invention', () => {
    expect(codes('      C: https://example.com\n')).toEqual([CODE.badAddress]);
    expect(codes('      C3: { tip: nowhere }\n')).toEqual([CODE.missingKey]);
    expect(codes('      C3: { url: https://example.com, to: "S!A1" }\n')).toEqual([
      CODE.conflictingKeys,
    ]);
    expect(codes('      C3: { url: https://example.com, hint: no }\n')).toEqual([CODE.unknownKey]);
  });
});
