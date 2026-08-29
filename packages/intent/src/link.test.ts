import type { LinkTarget } from '@yxl-vscode/spec';
import type { A1Addr, SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { english, files, tried } from './harness';
import { setLink } from './link';

/** The link set, through the checker — the file, or why not. */
function linked(source: string, at: string, target: LinkTarget | null): string {
  const { doc, grid, read } = files(source);
  const where = { sheet: 'S' as SheetName, at: at as A1Addr, target };
  const intent = setLink({ doc, grid }, where, read);
  return tried(source, intent);
}

const url = (text: string): LinkTarget => ({ kind: 'url', text });
const to = (text: string): LinkTarget => ({ kind: 'to', text });

const SHEET = 'sheets:\n  - name: S\n    cells:\n      A1: Region\n';

describe('a link on a cell', () => {
  it('is written bare where it goes out of the workbook', () => {
    expect(linked(SHEET, 'A1', url('https://example.com'))).toBe(
      `${SHEET}    links:\n      A1: https://example.com\n`,
    );
  });

  it('is written as a `to` where it goes inside it, which is never inferred', () => {
    expect(linked(SHEET, 'A1', to('S!B2'))).toBe(
      `${SHEET}    links:\n      A1:\n        to: "S!B2"\n`,
    );
  });

  it('goes in beside the links the sheet has, in the form each kind takes', () => {
    const already = `${SHEET}    links:\n      A1: https://example.com\n`;
    expect(linked(already, 'B2', url('https://example.com/two'))).toBe(
      `${already}      B2: https://example.com/two\n`,
    );
    expect(linked(already, 'B2', to('S!A1'))).toBe(`${already}      B2:\n        to: "S!A1"\n`);
  });

  it('points an existing link elsewhere, and keeps the tip it was written with', () => {
    const bare = `${SHEET}    links:\n      A1: https://example.com\n`;
    expect(linked(bare, 'A1', url('https://example.com/two'))).toBe(
      `${SHEET}    links:\n      A1: https://example.com/two\n`,
    );

    const tipped = `${SHEET}    links:\n      A1: { to: "S!B2", tip: The other one }\n`;
    expect(linked(tipped, 'A1', to('S!C3'))).toBe(
      `${SHEET}    links:\n      A1: { to: "S!C3", tip: The other one }\n`,
    );
  });

  it('is taken off by its entry going, and the key goes with the last of them', () => {
    const one = `${SHEET}    links:\n      A1: https://example.com\n`;
    expect(linked(one, 'A1', null)).toBe(SHEET);

    const two = `${one}      B2: https://example.com/two\n`;
    expect(linked(two, 'B2', null)).toBe(one);
  });

  it('refuses what it cannot do without guessing', () => {
    expect(linked(SHEET, 'A1', null)).toBe('refused: `A1` has no link to take off');
    expect(linked(SHEET, 'A1', url(''))).toBe('refused: a link needs somewhere to go');

    const bare = `${SHEET}    links:\n      A1: https://example.com\n`;
    expect(linked(bare, 'A1', to('S!B2'))).toBe(
      'refused: `A1` links out of the workbook — take that link off first',
    );

    const inside = `${SHEET}    links:\n      A1: { to: "S!B2" }\n`;
    expect(linked(inside, 'A1', url('https://example.com'))).toBe(
      'refused: the link on `A1` does not go to a `url`',
    );
  });

  it('refuses to write where the links are kept in another file, or on a sheet it has not got', () => {
    const elsewhere = `${SHEET}    links:\n      $include: links.yxl.yaml\n`;
    expect(linked(elsewhere, 'A1', url('https://example.com'))).toBe(
      'refused: `S` keeps its links in another file',
    );

    const { doc, grid, read } = files(SHEET);
    const where = { sheet: 'Other' as SheetName, at: 'A1' as A1Addr, target: url('x') };
    const intent = setLink({ doc, grid }, where, read);
    expect(intent.kind === 'refused' && english(intent.why)).toBe(
      'there is no sheet named `Other`',
    );
  });
});
