import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import type { ScalarValue } from '@yxl-vscode/spec';
import { type FilePath, filePath, type Rect, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { reading } from './direct';
import { setValidation } from './validation';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);

function files(source: string) {
  const includes: IncludeReader = (_from, path) => (path === ROOT ? { file: ROOT, source } : null);
  const { doc } = load(parse(source, { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return { doc, grid: compile(doc, { read: includes }), read: reading(() => source), includes };
}

/** The validation set, through the checker — the file, or why not. */
function validated(source: string, rect: Rect, choices: readonly ScalarValue[] | null): string {
  const { doc, grid, read } = files(source);
  const intent = setValidation({ doc, grid }, { sheet: 'S' as SheetName, rect, choices }, read);
  if (intent.kind === 'refused') return `refused: ${intent.why}`;
  if (intent.kind !== 'edit') throw new Error('a file was not written');

  const { includes } = files(source);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);

  return done.ok === false ? `refused: ${done.diagnostics[0]?.message ?? 'a surprise'}` : done.text;
}

const SHEET = 'sheets:\n  - name: S\n    cells:\n      A1: Region\n';
const OVER = { top: 2, left: 2, bottom: 9, right: 2 };

describe('a list validation over a range', () => {
  it('is written under the sheet, with the `validations` key where there is none', () => {
    expect(validated(SHEET, OVER, ['Draft', 'Sent'])).toBe(
      `${SHEET}    validations:\n      - at: B2:B9\n        list: [Draft, Sent]\n`,
    );
  });

  it('goes in after the validations the sheet has', () => {
    const already = `${SHEET}    validations:\n      - at: D2:D9\n        whole: { at_least: 1 }\n`;
    expect(validated(already, OVER, ['Draft'])).toBe(
      `${already}      - at: B2:B9\n        list: [Draft]\n`,
    );
  });

  it('quotes a choice that would not read back as itself', () => {
    expect(validated(SHEET, OVER, ['Yes: really', 3])).toBe(
      `${SHEET}    validations:\n      - at: B2:B9\n        list: ["Yes: really", 3]\n`,
    );
  });

  it('is taken off by its entry going, and the key goes with the last of them', () => {
    const one = `${SHEET}    validations:\n      - at: B2:B9\n        list: [Draft]\n`;
    expect(validated(one, OVER, null)).toBe(SHEET);

    const two = `${one}      - at: D2:D9\n        whole: { at_least: 1 }\n`;
    expect(validated(two, OVER, null)).toBe(
      two.replace('      - at: B2:B9\n        list: [Draft]\n', ''),
    );
  });

  it('refuses a second validation over a range that has one, rather than picking', () => {
    const already = `${SHEET}    validations:\n      - at: B1:B20\n        list: [Draft]\n`;
    expect(validated(already, OVER, ['Sent'])).toBe(
      'refused: `B1:B20` already has a validation, and a cell takes one at a time',
    );
  });

  it('refuses a list with nothing in it, and a range with nothing to take off', () => {
    expect(validated(SHEET, OVER, [])).toBe('refused: a list needs a choice to offer');
    expect(validated(SHEET, OVER, null)).toBe('refused: nothing here has a validation to take off');
  });
});
