import { cellAt, compile, resolve, styleAt } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import { addrAt } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { largeSpec } from './scale';

/**
 * What §9 R5 asked for: the projection measured against a spec larger than
 * anyone would write, so that §8 Q5 is answered with a number.
 *
 * The ceilings below are ten times the measured cost, not a target. They are
 * here to catch the day something turns linear work quadratic — the failure a
 * grid library would be bought to avoid — and not to fail a slow machine.
 */
const ROWS = 5000;
const COLUMNS = 20;
const CEILING = 10_000;

function timed<T>(what: () => T): { took: number; got: T } {
  const started = performance.now();
  const got = what();
  return { took: performance.now() - started, got };
}

describe(`a sheet of ${ROWS * COLUMNS} written cells`, () => {
  const source = largeSpec(ROWS, COLUMNS);

  it('parses, loads, and compiles in a time a keystroke can afford', () => {
    const parsed = timed(() => parse(source, { file: 'large.yxl.yaml' }));
    const loaded = timed(() => load(parsed.got));
    const doc = loaded.got.doc;
    if (doc === null) throw new Error('did not load');

    const compiled = timed(() => compile(doc));

    // Printed rather than asserted: the number is the point, and it belongs in
    // `ROADMAP.md` §8 Q5 where a decision was waiting for it.
    console.log(
      `${(source.length / 1024).toFixed(0)}KB of YAML · ` +
        `parse ${parsed.took.toFixed(0)}ms · ` +
        `load ${loaded.took.toFixed(0)}ms · ` +
        `compile ${compiled.took.toFixed(0)}ms`,
    );

    expect(loaded.got.diagnostics).toEqual([]);
    expect(compiled.got.sheets[0]?.cells.size).toBe(ROWS * COLUMNS);
    expect(parsed.took + loaded.took + compiled.took).toBeLessThan(CEILING);
  });

  it('flattens the whole written box, which is what the preview draws', () => {
    const { doc } = load(parse(source, { file: 'large.yxl.yaml' }));
    if (doc === null) throw new Error('did not load');

    const grid = compile(doc);
    const sheet = grid.sheets[0];
    if (sheet === undefined) throw new Error('compiled no sheet');

    // Exactly the loop the extension's `drawCells` runs: every address in the
    // box, asked what it holds and what it looks like.
    const drawn = timed(() => {
      let held = 0;
      for (let row = 1; row <= ROWS + 1; row += 1) {
        for (let col = 1; col <= COLUMNS + 1; col += 1) {
          const at = addrAt({ col, row });
          if (cellAt(sheet, at) !== null) held += 1;
          resolve(styleAt(sheet, at));
        }
      }
      return held;
    });

    console.log(`${(ROWS + 1) * (COLUMNS + 1)} addresses flattened · ${drawn.took.toFixed(0)}ms`);
    expect(drawn.got).toBeGreaterThan(ROWS * COLUMNS);
    expect(drawn.took).toBeLessThan(CEILING);
  });

  it('answers about one cell without walking the sheet', () => {
    const { doc } = load(parse(source, { file: 'large.yxl.yaml' }));
    if (doc === null) throw new Error('did not load');

    const grid = compile(doc);
    const sheet = grid.sheets[0];
    if (sheet === undefined) throw new Error('compiled no sheet');

    // What the inspector and the drawing both do, ten thousand times over.
    const asked = timed(() => {
      for (let row = 2; row < 1000; row += 1) {
        for (let col = 1; col <= 10; col += 1) {
          sheet.cells.get(`${label(col)}${row}`);
        }
      }
    });

    console.log(`10 000 cell lookups · ${asked.took.toFixed(0)}ms`);
    expect(asked.took).toBeLessThan(CEILING);
  });
});

function label(col: number): string {
  let name = '';
  for (let left = col; left > 0; left = Math.floor((left - 1) / 26)) {
    name = String.fromCharCode(65 + ((left - 1) % 26)) + name;
  }
  return name;
}
