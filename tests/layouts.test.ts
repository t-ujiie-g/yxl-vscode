import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addressesIn,
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  compile,
  REACH,
  resolve,
  styleAt,
} from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import { type A1Addr, columnLabel, rangeOf } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { includeReader, REPO_ROOT, yxlExamples } from './corpus';
import { build, check, extract } from './oracle';

/**
 * Tier 3 for `layouts:`: what this editor draws of a spec, against what the
 * compiler builds of it and reads back flat, where no layout is left.
 */
const own = join(REPO_ROOT, 'tests', 'fixtures', 'layouts');
const specs = [
  ...yxlExamples()
    .filter((one) => one.name.endsWith('.yxl.yaml'))
    .filter((one) => /^\s*layouts:/m.test(one.source) || one.name === 'workbook.yxl.yaml'),
  ...readdirSync(own)
    .filter((name) => name.endsWith('.yxl.yaml'))
    .map((name) => ({ name, path: join(own, name) })),
];

function grid(path: string): CompiledGrid {
  const { doc, diagnostics } = load(
    parse(readFileSync(path, 'utf8'), { file: path }),
    includeReader,
  );
  expect(diagnostics).toEqual([]);
  if (doc === null) throw new Error(`${path} did not load`);

  const compiled = compile(doc, { read: includeReader });
  expect(compiled.diagnostics).toEqual([]);
  return compiled;
}

/** What a cell holds, as both sides can say it. */
function holds(sheet: CompiledSheet, at: A1Addr) {
  const cell = cellAt(sheet, at);
  return { value: cell?.value ?? null, formula: cell?.formula ?? null };
}

/** The parts of a look the flat read-back keeps as written. */
function look(sheet: CompiledSheet, at: A1Addr) {
  const said = resolve(styleAt(sheet, at));
  return {
    fill: said.fill ?? null,
    bold: said['font.bold'] ?? null,
    italic: said['font.italic'] ?? null,
    format: said.format ?? null,
  };
}

/** Excel's standard width as a workbook stores it, which a band that sets no width is written with (`docs/spec.md` §4). */
const STANDARD = 9.140625;

function widths(sheet: CompiledSheet): Record<string, number> {
  const said: Record<string, number> = {};
  for (const band of sheet.columns) {
    for (let col = band.first; col <= band.last; col += 1) {
      if (band.size !== null && band.size !== STANDARD) said[columnLabel(col)] = band.size;
    }
  }
  return said;
}

describe.each(specs)('$name', (spec) => {
  it('draws what the compiler builds', () => {
    expect(check(spec.path).said).toContain('ok');

    const dir = mkdtempSync(join(tmpdir(), 'yxl-layouts-'));
    const book = join(dir, 'book.xlsx');
    const back = join(dir, 'back.yxl.yaml');
    build(spec.path, book);
    extract(book, back);

    const ours = grid(spec.path);
    const theirs = grid(back);
    expect(ours.sheets.map((one) => one.name)).toEqual(theirs.sheets.map((one) => one.name));

    for (const [index, mine] of ours.sheets.entries()) {
      const built = theirs.sheets[index];
      if (built === undefined) continue;

      const addresses = new Set([...addressesIn(mine, REACH), ...addressesIn(built, REACH)]);
      for (const at of addresses) {
        const where = `${mine.name}!${at}`;
        expect(holds(mine, at), where).toEqual(holds(built, at));
        expect(look(mine, at), where).toEqual(look(built, at));
      }

      const merged = (sheet: CompiledSheet) => sheet.merges.map((one) => rangeOf(one.rect)).sort();
      expect(merged(mine)).toEqual(merged(built));
      expect(widths(mine)).toEqual(widths(built));

      const ruled = (sheet: CompiledSheet) =>
        sheet.conditional.map((one) => `${rangeOf(one.rect)} ${JSON.stringify(one.test)}`).sort();
      expect(ruled(mine)).toEqual(ruled(built));

      const anchored = (sheet: CompiledSheet) => [
        ...sheet.charts.map((one) => one.at),
        ...sheet.tables.map((one) => rangeOf(one.rect)),
        ...sheet.validations.map((one) => rangeOf(one.rect)),
      ];
      expect(anchored(mine)).toEqual(anchored(built));
    }
  });
});
