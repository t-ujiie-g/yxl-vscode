import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Covered, DOCUMENT_KEYS, MODELED_KEYS, SHEET_KEYS } from '@yxl-vscode/spec';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, yxlRoot } from './corpus';

/**
 * The keys upstream's own schema gives a construct, which is the list this
 * editor's coverage table has to match exactly. `$include` is the format's
 * grammar rather than a construct, and is not one of them.
 */
function schemaKeys(of: 'document' | 'sheet'): string[] {
  const schema = JSON.parse(readFileSync(join(yxlRoot(), 'docs/yxl.schema.json'), 'utf8'));
  const held = of === 'document' ? schema : schema.definitions?.sheet;

  return Object.keys(held?.properties ?? {}).filter((key) => key !== '$include');
}

/** The table as the README carries it: one row per key, in the order the schema lists them. */
function rendered(): string {
  const rows = (covered: readonly Covered[]): string =>
    covered.map((one) => `| \`${one.key}\` | ${STANDING[one.standing]} | ${one.says} |`).join('\n');

  return [
    '### A document',
    '',
    '| Key | | |',
    '|---|---|---|',
    rows(DOCUMENT_KEYS),
    '',
    '### A sheet',
    '',
    '| Key | | |',
    '|---|---|---|',
    rows(SHEET_KEYS),
  ].join('\n');
}

const STANDING = {
  editable: '**edited**',
  preview: 'drawn',
  opaque: 'carried',
} as const;

const MARKS = { start: '<!-- coverage:start -->', end: '<!-- coverage:end -->' };

/** Whether this run is to write the README's block rather than only to check it. */
const { COVERAGE: WRITING } = process.env;

describe('what this editor does with each key of the schema', () => {
  it('names every key the upstream schema gives a document, and no other', () => {
    expect(DOCUMENT_KEYS.map((one) => one.key)).toEqual(schemaKeys('document'));
  });

  it('names every key the upstream schema gives a sheet, and no other', () => {
    expect(SHEET_KEYS.map((one) => one.key)).toEqual(schemaKeys('sheet'));
  });

  it('calls a key carried exactly where the loader leaves it opaque', () => {
    // Not a claim but a consequence: a key `MODELED_KEYS` does not list is
    // carried through untouched, so the table cannot disagree with the loader.
    const carried = (covered: readonly Covered[], modeled: ReadonlySet<string>): string[] =>
      covered
        .filter((one) => (one.standing === 'opaque') !== !modeled.has(one.key))
        .map((one) => one.key);

    expect(carried(DOCUMENT_KEYS, MODELED_KEYS.document)).toEqual([]);
    expect(carried(SHEET_KEYS, MODELED_KEYS.sheet)).toEqual([]);
  });

  it('says the same in the README, which is written from it', () => {
    const readme = join(REPO_ROOT, 'README.md');
    const source = readFileSync(readme, 'utf8');
    const between = new RegExp(`${MARKS.start}([\\s\\S]*?)${MARKS.end}`);
    if (between.exec(source) === null) {
      throw new Error(`${readme} has no \`${MARKS.start}\` block to write into`);
    }

    if (WRITING === 'write') {
      writeFileSync(readme, source.replace(between, `${MARKS.start}\n${rendered()}\n${MARKS.end}`));
    }

    const said = 'run `COVERAGE=write pnpm test tests/coverage.test.ts` to write it';
    const table = between.exec(readFileSync(readme, 'utf8'))?.[1]?.trim();
    expect({ said, table }).toEqual({ said, table: rendered() });
  });
});
