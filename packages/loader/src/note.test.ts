import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function loaded(body: string) {
  return load(parse(`sheets:\n  - name: S\n    comments:\n${body}`, { file: 'spec.yxl.yaml' }));
}

function notes(body: string) {
  return (loaded(body).doc?.sheets[0]?.comments ?? []).map((note) => ({
    at: note.at,
    text: note.text,
    author: note.author,
  }));
}

function codes(body: string): string[] {
  return loaded(body).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('a note', () => {
  it('is the text itself where it is written bare', () => {
    expect(notes('      C3: check stock before confirming\n')).toEqual([
      { at: 'C3', text: 'check stock before confirming', author: null },
    ]);
  });

  it('carries the author the expanded form names', () => {
    expect(notes('      B1: { text: from the Statuses sheet, author: Finance }\n')).toEqual([
      { at: 'B1', text: 'from the Statuses sheet', author: 'Finance' },
    ]);
  });

  it('keeps an address a parameter fills in', () => {
    expect(notes('      "${where}": look here\n')).toEqual([
      { at: { kind: 'template', text: '${where}' }, text: 'look here', author: null },
    ]);
  });

  it('needs an address, a text, and no key of its own invention', () => {
    expect(codes('      C: check stock\n')).toEqual([CODE.badAddress]);
    expect(codes('      C3: { author: Finance }\n')).toEqual([CODE.missingKey]);
    expect(codes('      C3: { text: hello, colour: red }\n')).toEqual([CODE.unknownKey]);
    expect(codes('      C3: [one, two]\n')).toEqual([CODE.notText]);
  });
});

describe('notes written as a list', () => {
  it('read each entry at its own `at:`, an A1 cell or a cell by meaning', () => {
    const read = loaded(
      '      - { at: C3, text: check stock }\n      - { at: { layout: stores, column: store, where: { store: 渋谷 } }, text: 改装, author: 本部 }\n',
    ).doc?.sheets[0]?.comments;
    expect(read?.map((one) => [one.at, one.listed, one.text, one.author])).toEqual([
      ['C3', true, 'check stock', null],
      [
        {
          kind: 'layout',
          layout: 'stores',
          column: 'store',
          finds: { kind: 'where', pairs: [['store', '渋谷']] },
        },
        true,
        '改装',
        '本部',
      ],
    ]);
  });

  it('need an `at:`, a text, and no key of their own invention', () => {
    expect(codes('      - { text: hello }\n')).toEqual([CODE.missingKey]);
    expect(codes('      - { at: C3 }\n')).toEqual([CODE.missingKey]);
    expect(codes('      - { at: C3, text: hello, colour: red }\n')).toEqual([CODE.unknownKey]);
  });
});
