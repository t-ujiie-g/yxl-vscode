import type { A1Addr, SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { english, files, tried } from './harness';
import { setNote } from './note';

/** The note set, through the checker — the file, or why not. */
function noted(source: string, at: string, text: string | null): string {
  const { doc, grid, read } = files(source);
  const where = { sheet: 'S' as SheetName, at: at as A1Addr, text };
  const intent = setNote({ doc, grid }, where, read);
  return tried(source, intent);
}

const SHEET = 'sheets:\n  - name: S\n    cells:\n      A1: Region\n';

describe('a note on a cell', () => {
  it('is written under the sheet, with the `comments` key where there is none', () => {
    expect(noted(SHEET, 'A1', 'check stock')).toBe(
      `${SHEET}    comments:\n      A1: check stock\n`,
    );
  });

  it('goes in beside the notes the sheet has', () => {
    const already = `${SHEET}    comments:\n      A1: sourced upstream\n`;
    expect(noted(already, 'B2', 'and this one too')).toBe(`${already}      B2: and this one too\n`);
  });

  it('changes the text a cell already carries, in the form it is written in', () => {
    const bare = `${SHEET}    comments:\n      A1: sourced upstream\n`;
    expect(noted(bare, 'A1', 'sourced from Finance')).toBe(
      `${SHEET}    comments:\n      A1: sourced from Finance\n`,
    );

    const expanded = `${SHEET}    comments:\n      A1: { text: sourced upstream, author: Finance }\n`;
    expect(noted(expanded, 'A1', 'sourced from Finance')).toBe(
      `${SHEET}    comments:\n      A1: { text: sourced from Finance, author: Finance }\n`,
    );
  });

  it('is taken off by its entry going, and the key goes with the last of them', () => {
    const one = `${SHEET}    comments:\n      A1: sourced upstream\n`;
    expect(noted(one, 'A1', null)).toBe(SHEET);

    const two = `${one}      B2: and this one\n`;
    expect(noted(two, 'B2', null)).toBe(one);
  });

  it('refuses what it has nothing to do: no note to take off, and a note with nothing to say', () => {
    expect(noted(SHEET, 'A1', null)).toBe('refused: `A1` has no note to take off');
    expect(noted(SHEET, 'A1', '')).toBe('refused: a note needs something to say');
  });

  it('refuses to write where the notes are kept in another file, or under no text', () => {
    const elsewhere = `${SHEET}    comments:\n      $include: notes.yxl.yaml\n`;
    expect(noted(elsewhere, 'A1', 'check stock')).toBe(
      'refused: `S` keeps its notes in another file',
    );

    const authored = `${SHEET}    comments:\n      A1: { author: Finance }\n`;
    expect(noted(authored, 'A1', 'check stock')).toBe(
      'refused: the note on `A1` is not written as text',
    );
  });

  it('refuses a sheet it does not have', () => {
    const { doc, grid, read } = files(SHEET);
    const where = { sheet: 'Other' as SheetName, at: 'A1' as A1Addr, text: 'hello' };
    const intent = setNote({ doc, grid }, where, read);

    expect(intent.kind === 'refused' && english(intent.why)).toBe(
      'there is no sheet named `Other`',
    );
  });
});
