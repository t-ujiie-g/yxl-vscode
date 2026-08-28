import type { Visibility } from '@yxl-vscode/spec';
import type { SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { files, tried } from './harness';
import { addSheet, deleteSheet, moveSheet, setTab } from './sheets';

/** The sheet added, through the checker — the file, or why not. */
function added(source: string, name: string): string {
  const { doc, grid, read } = files(source);
  const intent = addSheet({ doc, grid }, { name }, read);
  return tried(source, intent);
}

/** The sheet taken out, through the checker — the file, or why not. */
function deleted(source: string, sheet: string): string {
  const { doc, grid, read } = files(source);
  const intent = deleteSheet({ doc, grid }, { sheet: sheet as SheetName }, read);
  return tried(source, intent);
}

/** The sheet moved, through the checker — the file, or why not. */
function moved(source: string, sheet: string, to: number): string {
  const { doc, grid, read } = files(source);
  const intent = moveSheet({ doc, grid }, { sheet: sheet as SheetName, to }, read);
  return tried(source, intent);
}

/** The tab set, through the checker — the file, or why not. */
function tabbed(
  source: string,
  sheet: string,
  of: { visibility?: Visibility; color?: string | null; gridlines?: boolean },
): string {
  const { doc, grid, read } = files(source);
  const intent = setTab(
    { doc, grid },
    { sheet: sheet as SheetName, ...of, color: of.color as never },
    read,
  );
  return tried(source, intent);
}

const ONE = 'sheets:\n  - name: Sales\n    cells:\n      A1: 1\n';

const TWO = `${ONE}  - name: Notes\n    cells:\n      A1: hello\n`;

describe('a sheet added', () => {
  it('goes last in the list, which is tab order, holding nothing yet', () => {
    expect(added(ONE, 'Notes')).toBe(`${ONE}  - name: Notes\n`);
  });

  it('is written as the spec would quote it, where the name needs quoting', () => {
    expect(added(ONE, 'Q3 data')).toContain('  - name: Q3 data\n');
    expect(added(ONE, 'true')).toContain('  - name: "true"\n');
  });

  it('is refused under a name a sheet already has, which the compiler refuses too', () => {
    expect(added(ONE, 'Sales')).toBe('refused: there is already a sheet named `Sales`');
  });

  it('is refused under a name a sheet cannot have, saying which rule', () => {
    expect(added(ONE, 'A:B')).toBe('refused: a sheet name cannot hold `:`');
    expect(added(ONE, '')).toBe('refused: a sheet needs a name');
    expect(added(ONE, 'History')).toBe('refused: `History` is a name Excel keeps for itself');
  });
});

describe('a sheet taken out', () => {
  it('takes its entry and nothing else', () => {
    expect(deleted(TWO, 'Notes')).toBe(ONE);
    expect(deleted(TWO, 'Sales')).toBe('sheets:\n  - name: Notes\n    cells:\n      A1: hello\n');
  });

  it('takes the blank line between the sheets with it, either way round', () => {
    const spaced = `${ONE}\n  - name: Notes\n    cells:\n      A1: hello\n`;

    expect(deleted(spaced, 'Notes')).toBe(ONE);
    expect(deleted(spaced, 'Sales')).toBe(
      'sheets:\n  - name: Notes\n    cells:\n      A1: hello\n',
    );
  });

  it('is refused where it is the only sheet, which a workbook needs', () => {
    expect(deleted(ONE, 'Sales')).toBe(
      'refused: a workbook needs a sheet, and this is the only one',
    );
  });

  it('is refused where a surviving formula names it, rather than leaving `#REF!`', () => {
    const source = `${ONE}  - name: Notes\n    cells:\n      A1: { formula: "Sales!A1*2" }\n`;

    expect(deleted(source, 'Sales')).toBe(
      'refused: `Sales` is named by Notes!A1, which would be left with `#REF!`',
    );
  });

  it('leaves a formula on the sheet itself alone, which goes with it', () => {
    const source = `sheets:\n  - name: Sales\n    cells:\n      A1: 1\n      A2: { formula: "Sales!A1*2" }\n  - name: Notes\n    cells:\n      A1: hello\n`;

    expect(deleted(source, 'Sales')).toBe(
      'sheets:\n  - name: Notes\n    cells:\n      A1: hello\n',
    );
  });

  it('takes the overrides on its cells with it, and the key where none is left', () => {
    const source = `${TWO}overrides:\n  - at: Sales!A1\n    value: 9\n`;

    expect(deleted(source, 'Sales')).toBe(
      'sheets:\n  - name: Notes\n    cells:\n      A1: hello\n',
    );
  });

  it('leaves the overrides on the sheets that stay', () => {
    const source = `${TWO}overrides:\n  - at: Sales!A1\n    value: 9\n  - at: Notes!A1\n    value: bye\n`;

    expect(deleted(source, 'Sales')).toBe(
      'sheets:\n  - name: Notes\n    cells:\n      A1: hello\noverrides:\n  - at: Notes!A1\n    value: bye\n',
    );
  });

  it('is refused where the only other sheet is hidden, since one must show', () => {
    const source = `${ONE}  - name: Notes\n    visibility: hidden\n`;

    expect(deleted(source, 'Sales')).toBe(
      'refused: a workbook needs a sheet that shows, and this is the only one',
    );
  });

  it('is refused where there is no such sheet', () => {
    expect(deleted(TWO, 'Gone')).toBe('refused: there is no sheet named `Gone`');
  });
});

describe('a sheet moved along the tab bar', () => {
  const THREE = `${TWO}  - name: Costs\n    cells:\n      A1: 3\n`;

  it('goes where it was let go, and every other sheet keeps its bytes', () => {
    expect(moved(THREE, 'Costs', 0)).toBe(
      'sheets:\n  - name: Costs\n    cells:\n      A1: 3\n  - name: Sales\n    cells:\n      A1: 1\n  - name: Notes\n    cells:\n      A1: hello\n',
    );
  });

  it('goes to the end, which is the other way round', () => {
    expect(moved(THREE, 'Sales', 2)).toBe(
      'sheets:\n  - name: Notes\n    cells:\n      A1: hello\n  - name: Costs\n    cells:\n      A1: 3\n  - name: Sales\n    cells:\n      A1: 1\n',
    );
  });

  it('leaves the blank lines between the sheets where they were', () => {
    const spaced = `${ONE}\n  - name: Notes\n    cells:\n      A1: hello\n`;

    expect(moved(spaced, 'Notes', 0)).toBe(
      'sheets:\n  - name: Notes\n    cells:\n      A1: hello\n\n  - name: Sales\n    cells:\n      A1: 1\n',
    );
  });

  it('is refused where it is already there, and where there is no such place', () => {
    expect(moved(TWO, 'Sales', 0)).toBe('refused: `Sales` is already there');
    expect(moved(TWO, 'Sales', 2)).toBe('refused: a sheet cannot go there');
    expect(moved(TWO, 'Gone', 0)).toBe('refused: there is no sheet named `Gone`');
  });
});

describe("a tab's own two keys", () => {
  it('hides a sheet by writing `visibility:`, and shows it by taking the key out', () => {
    expect(tabbed(TWO, 'Notes', { visibility: 'hidden' })).toBe(`${TWO}    visibility: hidden\n`);

    const hidden = `${TWO}    visibility: hidden\n`;
    expect(tabbed(hidden, 'Notes', { visibility: 'visible' })).toBe(TWO);
  });

  it('writes and takes off a tab colour', () => {
    expect(tabbed(TWO, 'Sales', { color: '1F77B4' })).toBe(
      'sheets:\n  - name: Sales\n    cells:\n      A1: 1\n    tab_color: 1F77B4\n  - name: Notes\n    cells:\n      A1: hello\n',
    );

    const worn = 'sheets:\n  - name: Sales\n    tab_color: 1F77B4\n  - name: Notes\n';
    expect(tabbed(worn, 'Sales', { color: null })).toBe(
      'sheets:\n  - name: Sales\n  - name: Notes\n',
    );
  });

  it('is refused where hiding it would leave nothing showing', () => {
    expect(tabbed(ONE, 'Sales', { visibility: 'hidden' })).toBe(
      'refused: a workbook needs a sheet that shows, and this is the only one',
    );
  });

  it('leaves `very_hidden` to VBA, both ways round', () => {
    expect(tabbed(TWO, 'Notes', { visibility: 'very_hidden' })).toBe(
      'refused: `very_hidden` is not written by this editor',
    );

    const buried = `${TWO}    visibility: very_hidden\n`;
    expect(tabbed(buried, 'Notes', { visibility: 'visible' })).toContain("only Excel's VBA undoes");
  });

  it('turns the gridlines off by writing `false`, and on by taking the key out', () => {
    expect(tabbed(TWO, 'Notes', { gridlines: false })).toBe(`${TWO}    gridlines: false\n`);

    const off = `${TWO}    gridlines: false\n`;
    expect(tabbed(off, 'Notes', { gridlines: true })).toBe(TWO);
  });

  it('is refused where nothing about the sheet would change', () => {
    expect(tabbed(TWO, 'Notes', { visibility: 'visible' })).toBe(
      'refused: nothing about this sheet would change',
    );
    expect(tabbed(TWO, 'Notes', { gridlines: true })).toBe(
      'refused: nothing about this sheet would change',
    );
  });
});
