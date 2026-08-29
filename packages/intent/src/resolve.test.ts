import type { A1Addr, SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { english, files, ROOT } from './harness';
import { type Candidate, candidates } from './resolve';

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

const DOWN = `sheets:
  - name: Sales
    cells:
      A1: Region
      B1: 100
      B2: 200
      B3: 300
    formulas:
      - at: C1:C3
        formula: "B1*0.05"
`;

function offered(
  source: string,
  at: string,
  typed: string,
  params: Map<string, string> = new Map(),
): readonly Candidate[] {
  const { grid, read } = files({ [ROOT]: source });
  return candidates(
    { grid, read, params },
    { sheet: 'Sales' as SheetName, at: at as A1Addr },
    typed,
  );
}

/** The chosen candidate, taken all the way to the file it would leave behind. */
function taken(source: string, candidate: Candidate): string {
  const { intent } = candidate;
  if (intent.kind === 'refused') throw new Error(`refused: ${english(intent.why)}`);
  if (intent.kind !== 'edit') throw new Error('a file was written, not a spec');

  const { includes } = files({ [ROOT]: source });
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);
  if (done.ok === false) throw new Error(`the checker refused it: ${done.diagnostics[0]?.message}`);
  if (done.ok === 'ask') throw new Error('the checker was surprised by it');

  return done.text;
}

describe('what a cell filled by a range can be edited into', () => {
  it('offers the range its own formula, from the cell it is anchored at', () => {
    const [candidate, ...rest] = offered(SPEC, 'C1', '=B1*0.1');

    expect(rest).toEqual([]);
    expect(candidate?.id).toBe('rangeFormula');
    expect(english(candidate?.what ?? '')).toContain('C1');
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

  it('offers the range its formula as it reads at the anchor, from a cell below it', () => {
    const [candidate] = offered(DOWN, 'C2', '=B2*0.1');

    expect(candidate?.id).toBe('rangeFormula');
    expect(english(candidate?.what ?? '')).toContain('`=B1*0.1` there');
  });

  it('writes the typed formula shifted back to the anchor', () => {
    const [candidate] = offered(DOWN, 'C2', '=B2*0.1');
    if (candidate === undefined) throw new Error('nothing was offered');

    expect(taken(DOWN, candidate)).toContain('formula: "B1*0.1"');
  });

  it('leaves the range alone where the typed formula cannot be shifted back to the anchor', () => {
    const offers = offered(DOWN, 'C2', '=B2*[unclosed');
    expect(offers.map((one) => one.id)).toEqual(['splitRange']);
  });

  it('offers to split the range around the cell, moving that cell alone', () => {
    const [, candidate] = offered(DOWN, 'C2', '=B2*0.1');

    expect(candidate?.id).toBe('splitRange');
    expect(candidate?.moves).toEqual([{ sheet: 'Sales', at: 'C2' }]);
  });

  it('splits it into the piece above, the cell, and the piece below, each re-anchored', () => {
    const [, candidate] = offered(DOWN, 'C2', '=B2*0.1');
    if (candidate === undefined) throw new Error('nothing was offered');

    expect(taken(DOWN, candidate)).toBe(
      DOWN.replace(
        '      - at: C1:C3\n        formula: "B1*0.05"\n',
        '      - at: C1:C1\n        formula: "B1*0.05"\n' +
          '      - at: C2:C2\n        formula: "B2*0.1"\n' +
          '      - at: C3:C3\n        formula: "B3*0.05"\n',
      ),
    );
  });

  it('does not offer to split a range whose own keys hold a `${...}`', () => {
    const spec = DOWN.replace('at: C1:C3', 'at: "C1:C${last}"').replace(
      'sheets:',
      'params:\n  last: 3\nsheets:',
    );
    const offers = offered(spec, 'C2', '=B2*0.1');

    expect(offers.map((one) => one.id)).toEqual(['rangeFormula']);
  });

  it('does not offer to split at the anchor, where the one formula is stored', () => {
    const offers = offered(DOWN, 'C1', '=B1*0.1');
    expect(offers.map((one) => one.id)).toEqual(['rangeFormula']);
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

  it('offers the table below it as well, where one ends on the row above', () => {
    const table = `sheets:\n  - name: Sales\n    data:\n      - at: A2\n        values:\n          - [APAC, 1]\n          - [EMEA, 2]\n`;
    const answers = offered(table, 'A4', 'LATAM');

    expect(answers.map((one) => [one.id, english(one.what)])).toEqual([
      ['newCell', 'Write `A4` as a new cell'],
      ['ontoBlock', 'Add a row to the table at `A2`'],
    ]);
  });

  it('puts the row in where the table is, with nothing in the fields before it', () => {
    const table = `sheets:\n  - name: Sales\n    data:\n      - at: A2\n        values:\n          - [APAC, 1]\n          - [EMEA, 2]\n`;
    const [, onto] = offered(table, 'B4', '3');
    if (onto === undefined) throw new Error('the table was not offered');

    expect(taken(table, onto)).toBe(
      `${table}`.replace('- [EMEA, 2]\n', '- [EMEA, 2]\n          - [null, 3]\n'),
    );
  });

  it('does not offer it where the table is not the row above', () => {
    const table = `sheets:\n  - name: Sales\n    data:\n      - at: A2\n        values:\n          - [APAC, 1]\n`;

    expect(offered(table, 'A9', 'LATAM').map((one) => one.id)).toEqual(['newCell']);
    expect(offered(table, 'D3', 'far').map((one) => one.id)).toEqual(['newCell']);
  });

  it('does not offer it for a formula, which a table has nowhere to keep', () => {
    const table = `sheets:\n  - name: Sales\n    data:\n      - at: A2\n        values:\n          - [APAC, 1]\n`;

    expect(offered(table, 'B3', '=A3*2').map((one) => one.id)).toEqual(['newCell']);
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

    expect(english(change?.what ?? '')).toContain('tax_rate');
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

describe('a cell that reads a parameter', () => {
  const PARAMS = `params:
  region: APAC
  quarter: Q3
sheets:
  - name: Sales
    cells:
      A1: "\${region}"
      A2: "\${region}"
      B1: "\${quarter} \${region}"
`;

  it('offers the default, with every cell that follows it', () => {
    const [change, ...rest] = offered(PARAMS, 'A1', 'EMEA');

    expect(rest).toEqual([]);
    expect(change?.id).toBe('parameter');
    expect(english(change?.what ?? '')).toContain('region');
    expect(change?.moves).toEqual([
      { sheet: 'Sales', at: 'A1' },
      { sheet: 'Sales', at: 'A2' },
      { sheet: 'Sales', at: 'B1' },
    ]);
  });

  it('writes the default where the spec declares it', () => {
    const [change] = offered(PARAMS, 'A1', 'EMEA');
    if (change === undefined) throw new Error('nothing was offered');

    expect(taken(PARAMS, change)).toContain('region: EMEA');
  });

  it('says nothing where the cell is a sentence and not a placeholder', () => {
    // `"${quarter} ${region}"` typed over with `Q4 EMEA` would have to be split
    // back across two parameters, and which half went where is the guess this
    // editor does not make.
    expect(offered(PARAMS, 'B1', 'Q4 EMEA')).toEqual([]);
  });

  it('says nothing while the preview is showing that parameter as something else', () => {
    // The default is not what the reader is looking at, so changing it would
    // leave the grid exactly as it is.
    expect(offered(PARAMS, 'A1', 'EMEA', new Map([['region', 'LATAM']]))).toEqual([]);
  });

  it('says nothing about a formula typed into one', () => {
    expect(offered(PARAMS, 'A1', '=A2')).toEqual([]);
  });
});

describe('a cell whose value is a field of a CSV', () => {
  const READS = `sheets:
  - name: Sales
    data:
      - at: A1
        csv: rows.csv
`;
  const CSV = 'APAC,2400000\nEMEA,1750000\n';

  /** The candidate for a cell of the block, against a spec that reads the file. */
  const into = (at: string, typed: string) => {
    const sources = { [ROOT]: READS, 'rows.csv': CSV };
    const { grid, read } = files(sources);
    return candidates(
      { grid, read, params: new Map() },
      { sheet: 'Sales' as SheetName, at: at as A1Addr },
      typed,
    );
  };

  it('offers the file the value comes from, naming it', () => {
    const [write, ...rest] = into('A2', 'LATAM');

    expect(rest).toEqual([]);
    expect(write?.id).toBe('dataFile');
    expect(english(write?.what ?? '')).toContain('rows.csv');
    expect(write?.moves).toEqual([{ sheet: 'Sales', at: 'A2' }]);
  });

  it('writes the field and not one byte more', () => {
    const [write] = into('A2', 'LATAM');
    const intent = write?.intent;
    if (intent?.kind !== 'wrote') throw new Error('nothing was offered for the file');

    expect(intent.file).toBe('rows.csv');
    expect(intent.text).toBe('APAC,2400000\nLATAM,1750000\n');
  });

  it('quotes what has to be quoted to read back as itself', () => {
    // What the reader typed means what it would mean in a cell — `007` is the
    // number seven, here as in the spec — and the field is written so that the
    // CSV reader reads that back.
    const [comma] = into('A2', 'EMEA, north');
    const [number] = into('B2', '007');

    expect(comma?.intent.kind === 'wrote' && comma.intent.text).toBe(
      'APAC,2400000\n"EMEA, north",1750000\n',
    );
    expect(number?.intent.kind === 'wrote' && number.intent.text).toBe('APAC,2400000\nEMEA,7\n');
  });

  it('says nothing about a formula, which a CSV cannot hold', () => {
    expect(into('A2', '=A1')).toEqual([]);
  });

  it('says nothing about a JSON block, whose bytes it cannot yet put back', () => {
    const sources = {
      [ROOT]: READS.replace('csv: rows.csv', 'json: rows.json'),
      'rows.json': '[["APAC", 1]]',
    };
    const { grid, read } = files(sources);

    expect(
      candidates(
        { grid, read, params: new Map() },
        { sheet: 'Sales' as SheetName, at: 'A1' as A1Addr },
        'LATAM',
      ),
    ).toEqual([]);
  });
});

describe('what it will not offer', () => {
  it('says nothing about a plain value, which a range cannot write', () => {
    expect(offered(SPEC, 'C1', '42')).toEqual([]);
  });

  it('says nothing about a cell the spec wrote itself', () => {
    expect(offered(SPEC, 'B1', '=A1*2')).toEqual([]);
  });

  it('says nothing about a sheet that is not there', () => {
    const { grid, read } = files({ [ROOT]: SPEC });
    const spec = { grid, read, params: new Map<string, string>() };

    expect(candidates(spec, { sheet: 'Nowhere' as SheetName, at: 'C1' as A1Addr }, '=1')).toEqual(
      [],
    );
  });
});
