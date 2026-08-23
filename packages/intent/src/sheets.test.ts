import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type FilePath, filePath, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { reading } from './direct';
import { addSheet, deleteSheet } from './sheets';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);

function files(source: string) {
  const includes: IncludeReader = (_from, path) => (path === ROOT ? { file: ROOT, source } : null);
  const { doc } = load(parse(source, { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return { doc, grid: compile(doc, { read: includes }), read: reading(() => source), includes };
}

/** The sheet added, through the checker — the file, or why not. */
function added(source: string, name: string): string {
  const { doc, grid, read } = files(source);
  const intent = addSheet({ doc, grid }, { name }, read);
  if (intent.kind === 'refused') return `refused: ${intent.why}`;
  if (intent.kind !== 'edit') throw new Error('a file was not written');

  const { includes } = files(source);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);

  return done.ok === false ? `refused: ${done.diagnostics[0]?.message ?? 'a surprise'}` : done.text;
}

/** The sheet taken out, through the checker — the file, or why not. */
function deleted(source: string, sheet: string): string {
  const { doc, grid, read } = files(source);
  const intent = deleteSheet({ doc, grid }, { sheet: sheet as SheetName }, read);
  if (intent.kind === 'refused') return `refused: ${intent.why}`;
  if (intent.kind !== 'edit') throw new Error('a file was not written');

  const { includes } = files(source);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);

  return done.ok === false ? `refused: ${done.diagnostics[0]?.message ?? 'a surprise'}` : done.text;
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

  it('is refused where it cannot tell another sheet would be left visible', () => {
    const source = `${ONE}  - name: Notes\n    visibility: hidden\n`;

    expect(deleted(source, 'Sales')).toContain('refused: every other sheet sets `visibility:`');
  });

  it('is refused where there is no such sheet', () => {
    expect(deleted(TWO, 'Gone')).toBe('refused: there is no sheet named `Gone`');
  });
});
