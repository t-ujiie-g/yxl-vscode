import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type FilePath, filePath, type Rect, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { reading } from './direct';
import { setSorted } from './sort';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);
const SALES = 'sheets:\n  - name: Sales\n';

function files(source: string) {
  const includes: IncludeReader = (_from, path) => (path === ROOT ? { file: ROOT, source } : null);
  const { doc } = load(parse(source, { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return { doc, grid: compile(doc, { read: includes }), read: reading(() => source), includes };
}

const at = (top: number, left: number, bottom: number, right = left): Rect => ({
  top,
  left,
  bottom,
  right,
});

/** The rows put in order, through the checker — the file, or why not. */
function sorted(source: string, rect: Rect, down = false): string {
  const { doc, grid, read } = files(source);
  const intent = setSorted({ doc, grid }, { sheet: 'Sales' as SheetName, rect, down }, read);
  if (intent.kind === 'refused') return `refused: ${intent.why}`;
  if (intent.kind !== 'edit') throw new Error('a file was not written');

  const { includes } = files(source);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);

  return done.ok === false ? `refused: ${done.diagnostics[0]?.message ?? 'a surprise'}` : done.text;
}

const TABLE = `${SALES}    data:\n      - at: A1\n        values:\n          - [EMEA, 3]\n          - [APAC, 1]\n          - [LATAM, 2]\n`;

describe('rows of a table put in order', () => {
  it('sorts by the column the selection starts in, and moves the whole row', () => {
    expect(sorted(TABLE, at(1, 1, 3))).toBe(
      `${SALES}    data:\n      - at: A1\n        values:\n          - [APAC, 1]\n          - [EMEA, 3]\n          - [LATAM, 2]\n`,
    );
  });

  it('sorts by a column further along, which is what the selection says', () => {
    expect(sorted(TABLE, at(1, 2, 3))).toContain(
      '          - [APAC, 1]\n          - [LATAM, 2]\n          - [EMEA, 3]\n',
    );
  });

  it('turns it round where the reader asked for the other way', () => {
    expect(sorted(TABLE, at(1, 1, 3), true)).toContain(
      '          - [LATAM, 2]\n          - [EMEA, 3]\n          - [APAC, 1]\n',
    );
  });

  it('leaves the rows outside the selection where they are', () => {
    // The first two put in order; LATAM was not selected and does not move.
    expect(sorted(TABLE, at(1, 1, 2))).toContain(
      '          - [APAC, 1]\n          - [EMEA, 3]\n          - [LATAM, 2]\n',
    );
  });

  it('writes each row as the file wrote it, so nothing about it changes but where it is', () => {
    const held = `${SALES}    data:\n      - at: A1\n        values:\n          - ["007", 2]\n          - [APAC, 1]\n`;

    expect(sorted(held, at(1, 2, 2))).toContain('          - [APAC, 1]\n          - ["007", 2]\n');
  });

  it('puts numbers before text and text before nothing, as a column orders', () => {
    const mixed = `${SALES}    data:\n      - at: A1\n        values:\n          - [text]\n          - [null]\n          - [2]\n`;

    expect(sorted(mixed, at(1, 1, 3))).toContain(
      '          - [2]\n          - [text]\n          - [null]\n',
    );
  });
});

describe('what a sort will not put in order', () => {
  it('rows that are not a table written here', () => {
    const spec = `${SALES}    cells:\n      A1: EMEA\n      A2: APAC\n`;

    expect(sorted(spec, at(1, 1, 2))).toBe(
      'refused: these rows are not a table written here, so there is no order to put them in',
    );
  });

  it('one row, which is in order already', () => {
    expect(sorted(TABLE, at(1, 1, 1))).toBe(
      'refused: a sort is more than one row, so there is nothing here to put in order',
    );
  });

  it('rows already in that order', () => {
    const held = `${SALES}    data:\n      - at: A1\n        values:\n          - [APAC, 1]\n          - [EMEA, 2]\n`;

    expect(sorted(held, at(1, 1, 2))).toBe('refused: these rows are in that order already');
  });

  it('rows written a line at a time', () => {
    const held = `${SALES}    data:\n      - at: A1\n        values:\n          - - EMEA\n            - 2\n          - - APAC\n            - 1\n`;

    expect(sorted(held, at(1, 1, 2))).toBe(
      'refused: rows written a line at a time are not put in order yet',
    );
  });
});
