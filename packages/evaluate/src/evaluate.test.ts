import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import { type A1Addr, qualified, type SheetName, sheetName } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import type { Asked, Engine, HeldSheet } from './engine';
import { evaluate } from './evaluate';

/**
 * An engine that answers `A1` with what `A1` holds, and nothing else.
 *
 * The pass logic is what these tests are about — which cells are asked for, in
 * what order they settle, what happens at the edges — and none of that is the
 * engine's. A real one is tested against `univer.test.ts`.
 */
function reader(): Engine & { readonly asked: Asked[] } {
  const asked: Asked[] = [];
  let book: readonly HeldSheet[] = [];

  return {
    asked,
    holds: (given) => {
      book = given;
    },
    about: (one) => ({ unknown: [], reads: [one.sheet] }),
    compute: (one) => {
      asked.push(one);
      const [across, down] = one.offset;
      const cells = book.find((sheet) => sheet.name === one.sheet)?.cells ?? [];
      const at = shifted(one.formula, across, down);
      const held = cells.find((cell) => cell.at === at);

      return held === undefined
        ? { kind: 'error', error: '#REF!' }
        : { kind: 'value', value: held.value };
    },
  };
}

/** The fake's whole language: an address, moved by the offset it was asked at. */
function shifted(formula: string, across: number, down: number): string {
  const cut = /^([A-Z]+)(\d+)$/.exec(formula);
  if (cut === null) return formula;

  const column = cut[1]?.charCodeAt(0) ?? 65;
  return `${String.fromCharCode(column + across)}${Number(cut[2]) + down}`;
}

function computed(source: string, limit?: number) {
  const { doc } = load(parse(source, { file: 'spec.yxl.yaml' }));
  if (doc === null) throw new Error('did not load');
  return evaluate(compile(doc), reader(), limit);
}

/** What one pass asks for — a settling workbook takes more than one. */
function asks(source: string): Asked[] {
  const { doc } = load(parse(source, { file: 'spec.yxl.yaml' }));
  if (doc === null) throw new Error('did not load');

  const engine = reader();
  let passes = 0;
  evaluate(compile(doc), {
    holds: (book) => {
      passes += 1;
      engine.holds(book);
    },
    about: engine.about,
    compute: (one) => (passes === 1 ? engine.compute(one) : { kind: 'value', value: null }),
  });

  return engine.asked;
}

const SALES = 'sheets:\n  - name: Sales\n';

/** A sheet name, branded the way the compiler would have branded it. */
function named(name: string): SheetName {
  const read = sheetName(name);
  if (read === null) throw new Error(`not a sheet name: ${name}`);
  return read;
}

describe('what a pass asks the engine for', () => {
  it('asks about every formula a cell holds, and nothing about a value', () => {
    const spec = `${SALES}    cells:\n      A1: 2\n      B1: { formula: "A1" }\n`;
    expect(asks(spec).map((one) => one.at)).toEqual(['B1']);
  });

  it('asks about a filled range cell by cell, with the offset from its anchor', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      A2: 2\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;
    expect(asks(spec).map((one) => [one.at, one.offset])).toEqual([
      ['B1', [0, 0]],
      ['B2', [0, 1]],
    ]);
  });

  it('leaves a cell the spec wrote over a filled range to the cell', () => {
    // `docs/spec.md` §3: a written cell wins over the range that covers it, and
    // asking twice would answer twice about one address.
    const spec = `${SALES}    cells:\n      A1: 1\n      A2: 2\n      B2: { formula: "A1" }\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;
    expect(
      asks(spec)
        .map((one) => one.at)
        .sort(),
    ).toEqual(['B1', 'B2']);
  });

  it('stops a range at the rows the sheet writes, which is where its inputs end', () => {
    // `B2:B1048576` is a legal thing to write and the point of the construct;
    // past the written rows every reference it makes is empty.
    const spec = `${SALES}    cells:\n      A1: 1\n      A2: 2\n    formulas:\n      - at: B1:B1048576\n        formula: "A1"\n`;
    expect(asks(spec)).toHaveLength(2);
  });

  it('gives the engine every sheet, including one that holds no value at all', () => {
    const spec = `sheets:\n  - name: Sales\n    cells:\n      A1: { formula: "A2" }\n  - name: Notes\n    cells:\n      A1: 4\n`;
    const engine = reader();
    const { doc } = load(parse(spec, { file: 'spec.yxl.yaml' }));
    if (doc === null) throw new Error('did not load');

    let given: readonly HeldSheet[] = [];
    evaluate(compile(doc), {
      holds: (book) => {
        given = book;
        engine.holds(book);
      },
      about: engine.about,
      compute: engine.compute,
    });

    expect(given.map((sheet) => sheet.name)).toEqual(['Sales', 'Notes']);
  });
});

describe('what a pass makes of the answers', () => {
  it('keeps what the engine said, under the cell that asked', () => {
    const spec = `${SALES}    cells:\n      A1: 2\n      B1: { formula: "A1" }\n`;
    expect(computed(spec).values.get(qualified(named('Sales'), 'B1' as A1Addr))).toEqual({
      kind: 'value',
      value: 2,
    });
  });

  it('runs another pass so a formula that reads a formula settles', () => {
    const spec = `${SALES}    cells:\n      A1: 2\n      A2: { formula: "A1" }\n      A3: { formula: "A2" }\n`;
    expect(computed(spec).values.get(qualified(named('Sales'), 'A3' as A1Addr))).toEqual({
      kind: 'value',
      value: 2,
    });
  });

  it('says a cell reading one that holds nothing is an error, not a zero', () => {
    const spec = `${SALES}    cells:\n      A1: { formula: "Z9" }\n`;
    expect(computed(spec).values.get(qualified(named('Sales'), 'A1' as A1Addr))).toEqual({
      kind: 'error',
      error: '#REF!',
    });
  });

  it('says a cell never settles rather than showing the guess it stopped at', () => {
    // A cell that answers differently every pass is what a circular reference
    // looks like from here: there is no answer, so none is given.
    const spec = `${SALES}    cells:\n      A1: { formula: "anything" }\n`;
    const { doc } = load(parse(spec, { file: 'spec.yxl.yaml' }));
    if (doc === null) throw new Error('did not load');

    let answers = 0;
    const done = evaluate(compile(doc), {
      holds: () => {},
      about: (one) => ({ unknown: [], reads: [one.sheet] }),
      compute: () => {
        answers += 1;
        return { kind: 'value', value: answers };
      },
    });

    expect(done.values.get(qualified(named('Sales'), 'A1' as A1Addr))?.kind).toBe('unsupported');
  });

  it('computes nothing at all for a workbook past the limit it was given', () => {
    // Half a total is a wrong total, and a wrong number is worse than none.
    const spec = `${SALES}    cells:\n      A1: 1\n      B1: { formula: "A1" }\n      C1: { formula: "A1" }\n`;
    const done = computed(spec, 1);

    expect([done.stopped, done.values.size]).toEqual([true, 0]);
  });

  it('computes a workbook that fits, and says so', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n      B1: { formula: "A1" }\n`;
    expect(computed(spec, 1).stopped).toBe(false);
  });
});
