import type { DataReader } from '@yxl-vscode/compile';
import type { Op } from '@yxl-vscode/cst';
import type { IncludeReader } from '@yxl-vscode/loader';
import { type A1Addr, type FilePath, filePath, qualified, type SheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { type Ctx, checked, checkedText, type Expects, nothingChanges } from './verify';

const read: IncludeReader & DataReader = () => null;
const SPEC_FILE = filePath('spec.yxl.yaml') ?? ('' as FilePath);
const ctx: Ctx = { root: SPEC_FILE, file: SPEC_FILE, read };

const SPEC = `sheets:
  - name: Sales
    columns:
      - at: B
        style: money
    cells:
      A1: Region
      B1: 2400000
      B2: 1750000
      B3: { formula: "SUM(B1:B2)" }
defs:
  styles:
    money: { format: "#,##0" }
`;

/** The claim an ordinary cell edit makes: these cells, ask about the rest. */
function about(...cells: string[]): Expects {
  const claimed = cells.map((cell) => {
    const [sheet, at] = cell.split('!');
    return qualified(sheet as SheetName, at as A1Addr);
  });

  return { cells: new Set(claimed), beyond: 'ask' };
}

function edit(source: string, expects: Expects, ...ops: Op[]) {
  return checked(source, { ops }, expects, ctx);
}

describe('an edit that does what it said', () => {
  it('is applied, and says how to take it back', () => {
    const done = edit(SPEC, about('Sales!B1'), {
      op: 'set',
      path: ['sheets', 0, 'cells', 'B1'],
      value: 9,
    });

    expect(done.ok).toBe(true);
    if (done.ok !== true) return;

    expect(done.text).toContain('B1: 9');
    expect(done.back?.ops).toEqual([
      { op: 'write', path: ['sheets', 0, 'cells', 'B1'], source: '2400000' },
    ]);
  });

  it('names what moved, in the terms a reader would recognise', () => {
    const done = edit(SPEC, about('Sales!A1'), {
      op: 'set',
      path: ['sheets', 0, 'cells', 'A1'],
      value: 'Area',
    });

    expect(done.ok !== false && done.changed).toEqual([
      { kind: 'cell', sheet: 'Sales', at: 'A1', what: 'value' },
    ]);
  });
});

describe('an edit that did more than it said', () => {
  const wider: Op = { op: 'set', path: ['defs', 'styles', 'money', 'format'], value: '0.00' };

  it('is held for asking, with the cells it surprised', () => {
    const done = edit(SPEC, about('Sales!B1'), wider);

    expect(done.ok).toBe('ask');
    if (done.ok !== 'ask') return;

    // The definition reaches the whole of column B through the band, and the
    // claim was one cell of it.
    expect(done.surprises.map((one) => one.kind === 'cell' && one.at).sort()).toEqual(['B2', 'B3']);
  });

  it('still says what the file would become, since the asking may be answered yes', () => {
    const done = edit(SPEC, about('Sales!B1'), wider);
    expect(done.ok !== false && done.text).toContain('format: "0.00"');
  });

  it('is refused outright when it claimed to change nothing', () => {
    // A refactor's promise is that nothing rendered moves. One cell that did is
    // the whole of the failure, whatever produced the patch (ADR-009).
    const done = edit(SPEC, nothingChanges, wider);

    expect(done.ok).toBe(false);
    if (done.ok !== false) return;
    expect(done.surprises.length).toBeGreaterThan(0);
  });

  it('takes a rename of a style as a change to every cell wearing it', () => {
    const done = edit(SPEC, nothingChanges, {
      op: 'renameKey',
      path: ['defs', 'styles', 'money'],
      to: 'currency',
    });

    expect(done.ok).toBe(false);
  });
});

describe('an edit that would break the spec', () => {
  it('is refused when what it wrote no longer reads as a span', () => {
    const done = edit(SPEC, about('Sales!B1'), {
      op: 'set',
      path: ['sheets', 0, 'columns', 0, 'at'],
      value: 'not a column',
    });

    expect(done.ok).toBe(false);
  });

  it('is refused when it names a style that is not there', () => {
    const done = edit(SPEC, about('Sales!B1'), {
      op: 'set',
      path: ['sheets', 0, 'columns', 0, 'style'],
      value: 'nosuch',
    });

    expect(done.ok).toBe(false);
    if (done.ok !== false) return;
    expect(done.diagnostics[0]?.code).toContain('unknown');
  });

  it('lets an edit through a spec that was already broken elsewhere', () => {
    // Someone is mid-keystroke in another part of the file. Refusing every edit
    // until the whole spec is valid would fail exactly when it is most wanted.
    const broken = SPEC.replace('A1: Region', 'A1: { $ref: nosuch }');
    const done = edit(broken, about('Sales!B1'), {
      op: 'set',
      path: ['sheets', 0, 'cells', 'B1'],
      value: 9,
    });

    expect(done.ok).toBe(true);
  });
});

describe('an edit that cannot be made at all', () => {
  it('is refused when its path is not there', () => {
    const done = edit(SPEC, about('Sales!Z9'), {
      op: 'set',
      path: ['sheets', 0, 'cells', 'Z9'],
      value: 1,
    });

    expect(done.ok).toBe(false);
  });

  it('is refused when it could not be undone', () => {
    const done = edit(SPEC, about('Sales!B3'), {
      op: 'set',
      path: ['sheets', 0, 'cells'],
      value: 1,
    });

    expect(done.ok).toBe(false);
    if (done.ok !== false) return;
    expect(done.diagnostics[0]?.code).toBe('patch.no-inverse');
  });

  it('is refused when the file cannot be read at all', () => {
    expect(edit('sheets: [\n', about('Sales!A1'), { op: 'set', path: ['a'], value: 1 }).ok).toBe(
      false,
    );
  });
});

describe('a file the spec reads rather than one it is written in', () => {
  const READS = `sheets:
  - name: Sales
    data:
      - at: A5
        csv: rows.csv
`;

  /** The spec, plus a CSV it reads, both answered by the same reader. */
  const beside = (csv: string): Ctx => ({
    root: SPEC_FILE,
    file: filePath('rows.csv') ?? ('' as FilePath),
    read: (_from, path) => ({ file: path, source: String(path) === 'rows.csv' ? csv : READS }),
  });

  it('is checked by compiling the spec with the file overlaid', () => {
    const done = checkedText('APAC,1\n', 'EMEA,1\n', about('Sales!A5'), beside('APAC,1\n'));

    expect(done.ok).toBe(true);
    if (done.ok !== true) return;
    expect(done.text).toBe('EMEA,1\n');
  });

  it('has no patch to take it back, because it is not a spec', () => {
    const done = checkedText('APAC,1\n', 'EMEA,1\n', about('Sales!A5'), beside('APAC,1\n'));
    expect(done.ok === true && done.back).toBeNull();
  });

  it('is refused when it moves a cell the edit did not name', () => {
    const done = checkedText(
      'APAC,1\n',
      'EMEA,2\n',
      { cells: new Set([qualified('Sales' as SheetName, 'A5' as A1Addr)]), beyond: 'refuse' },
      beside('APAC,1\n'),
    );

    expect(done.ok).toBe(false);
  });
});
