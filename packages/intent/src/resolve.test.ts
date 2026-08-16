import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type A1Addr, type FilePath, filePath, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import type { Text } from './direct';
import { type Candidate, candidates } from './resolve';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);

const SPEC = `sheets:
  - name: Sales
    cells:
      A1: Region
      B1: 100
      B2: 200
    formulas:
      - at: C1:C2
        formula: "B1*0.05"
`;

function files(sources: Record<string, string>) {
  const text: Text = (file) => sources[file] ?? null;
  const read: IncludeReader = (_from, path) =>
    sources[path] === undefined ? null : { file: filePath(path) ?? ROOT, source: sources[path] };

  const { doc } = load(parse(sources[ROOT] ?? '', { file: ROOT }), read);
  if (doc === null) throw new Error('did not load');

  return { doc, grid: compile(doc, { read }), text, read };
}

function offered(source: string, at: string, typed: string): readonly Candidate[] {
  const { grid, text } = files({ [ROOT]: source });
  return candidates(grid, { sheet: 'Sales' as SheetName, at: at as A1Addr }, typed, text);
}

/** The chosen candidate, taken all the way to the file it would leave behind. */
function taken(source: string, candidate: Candidate): string {
  if (candidate.intent.kind !== 'edit') throw new Error(`refused: ${candidate.intent.why}`);

  const { read } = files({ [ROOT]: source });
  const ctx: Ctx = { root: ROOT, file: candidate.intent.file, read };
  const done = checked(source, candidate.intent.patch, candidate.intent.expects, ctx);
  if (done.ok === false) throw new Error(`the checker refused it: ${done.diagnostics[0]?.message}`);
  if (done.ok === 'ask') throw new Error('the checker was surprised by it');

  return done.text;
}

describe('what a cell filled by a range can be edited into', () => {
  it('offers the range its own formula, from the cell it is anchored at', () => {
    const [candidate, ...rest] = offered(SPEC, 'C1', '=B1*0.1');

    expect(rest).toEqual([]);
    expect(candidate?.id).toBe('rangeFormula');
    expect(candidate?.what).toContain('C1');
  });

  it('names every cell the range fills, which is what makes the choice informed', () => {
    const [candidate] = offered(SPEC, 'C1', '=B1*0.1');
    expect(candidate?.moves).toEqual([
      { sheet: 'Sales', at: 'C1' },
      { sheet: 'Sales', at: 'C2' },
    ]);
  });

  it('writes the formula the reader typed, without its `=`', () => {
    const [candidate] = offered(SPEC, 'C1', '=B1*0.1');
    if (candidate === undefined) throw new Error('nothing was offered');

    expect(taken(SPEC, candidate)).toContain('formula: "B1*0.1"');
  });

  it('changes every cell of the range, and the checker agrees that it did', () => {
    const [candidate] = offered(SPEC, 'C1', '=B1*0.1');
    if (candidate === undefined) throw new Error('nothing was offered');

    const { grid } = files({ [ROOT]: taken(SPEC, candidate) });
    const sheet = grid.sheets[0];
    expect([
      sheet?.cells.get('C1' as A1Addr)?.formula ?? sheet?.fills[0]?.formula,
      sheet?.fills[0]?.formula,
    ]).toEqual(['B1*0.1', 'B1*0.1']);
  });
});

describe('a cell nothing has written yet', () => {
  it('offers to write it as a new entry, and moves only that cell', () => {
    const [candidate, ...rest] = offered(SPEC, 'A5', 'Total');

    expect(rest).toEqual([]);
    expect(candidate?.id).toBe('newCell');
    expect(candidate?.moves).toEqual([{ sheet: 'Sales', at: 'A5' }]);
  });

  it('writes it at the end of the cells the sheet already has', () => {
    const [candidate] = offered(SPEC, 'A5', 'Total');
    if (candidate === undefined) throw new Error('nothing was offered');

    expect(taken(SPEC, candidate)).toBe(
      SPEC.replace('      B2: 200\n', '      B2: 200\n      A5: Total\n'),
    );
  });

  it('reads what was typed the way the spec would read it', () => {
    const [candidate] = offered(SPEC, 'A5', '42');
    if (candidate === undefined) throw new Error('nothing was offered');

    expect(taken(SPEC, candidate)).toContain('A5: 42');
  });

  it('writes a formula as a formula', () => {
    const [candidate] = offered(SPEC, 'A5', '=B1+B2');
    if (candidate === undefined) throw new Error('nothing was offered');

    expect(taken(SPEC, candidate)).toContain('      A5:\n        formula: "B1+B2"');
  });

  it('writes the `cells:` key too, where the sheet has none', () => {
    const bare = 'sheets:\n  - name: Sales\n    columns:\n      - at: A\n        width: 12\n';
    const [candidate] = offered(bare, 'A1', 'Region');
    if (candidate === undefined) throw new Error('nothing was offered');

    expect(taken(bare, candidate)).toBe(`${bare}    cells:\n      A1: Region\n`);
  });

  it('says nothing about an empty box, which is not a value to write', () => {
    expect(offered(SPEC, 'A5', '')).toEqual([]);
  });
});

describe('a cell that reads a definition', () => {
  const SHARED = `defs:
  values:
    tax_rate: 0.085
sheets:
  - name: Sales
    cells:
      A1: 1
      B1: { $ref: tax_rate }
      B2:
        value: { $ref: tax_rate }
        format: "0.0%"
`;

  it('offers both answers: the definition, or this cell alone', () => {
    expect(offered(SHARED, 'B1', '0.1').map((one) => one.id)).toEqual(['definition', 'detach']);
  });

  it('counts what changing the definition would move, which is the point of asking', () => {
    const [change] = offered(SHARED, 'B1', '0.1');

    expect(change?.what).toContain('tax_rate');
    expect(change?.moves).toEqual([
      { sheet: 'Sales', at: 'B1' },
      { sheet: 'Sales', at: 'B2' },
    ]);
  });

  it('changes the definition where the definition is the answer', () => {
    const [change] = offered(SHARED, 'B1', '0.1');
    if (change === undefined) throw new Error('nothing was offered');

    expect(taken(SHARED, change)).toContain('tax_rate: 0.1');
  });

  it('detaches the one cell, leaving the definition where it was', () => {
    const [, detach] = offered(SHARED, 'B1', '0.1');
    if (detach === undefined) throw new Error('nothing was offered');

    const after = taken(SHARED, detach);
    expect(after).toContain('B1: 0.1');
    expect(after).toContain('tax_rate: 0.085');
  });

  it('detaches a cell that says more than the reference, keeping what it says', () => {
    const [, detach] = offered(SHARED, 'B2', '0.1');
    if (detach === undefined) throw new Error('nothing was offered');

    expect(taken(SHARED, detach)).toContain('        value: 0.1\n        format: "0.0%"');
  });

  it('asks even though one answer moves a single cell, because the other does not', () => {
    expect(offered(SHARED, 'B1', '0.1').every((one) => !one.alone)).toBe(true);
  });

  it('says nothing about a formula typed into one, which is a different namespace', () => {
    expect(offered(SHARED, 'B1', '=A1*2')).toEqual([]);
  });
});

describe('what it will not offer', () => {
  it('says nothing away from the anchor, where the formula would be off by a row', () => {
    // `=B2*0.1` typed into C2 means `B1*0.1` to a range anchored at C1, and
    // translating it back is not something this editor does yet.
    expect(offered(SPEC, 'C2', '=B2*0.1')).toEqual([]);
  });

  it('says nothing about a plain value, which a range cannot write', () => {
    expect(offered(SPEC, 'C1', '42')).toEqual([]);
  });

  it('says nothing about a cell the spec wrote itself', () => {
    expect(offered(SPEC, 'B1', '=A1*2')).toEqual([]);
  });

  it('says nothing about a sheet that is not there', () => {
    const { grid, text } = files({ [ROOT]: SPEC });
    expect(
      candidates(grid, { sheet: 'Nowhere' as SheetName, at: 'C1' as A1Addr }, '=1', text),
    ).toEqual([]);
  });
});
