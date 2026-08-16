import { parse } from '@yxl-vscode/cst';
import { load } from '@yxl-vscode/loader';
import { type A1Addr, type FilePath, filePath } from '@yxl-vscode/units';
import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { finds } from './find';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);

/** The addresses of the one sheet a spec draws that hold `text`. */
function found(source: string, text: string): A1Addr[] {
  const { doc } = load(parse(source, { file: ROOT }), () => null);
  if (doc === null) throw new Error('did not load');

  const sheet = compile(doc, { read: () => null }).sheets[0];
  if (sheet === undefined) throw new Error('no sheet');

  return finds(sheet, text);
}

const SALES = 'sheets:\n  - name: Sales\n';
const GRID = `${SALES}    cells:\n      A1: Region\n      B1: Revenue\n      A2: APAC\n      B2: 2400000\n      A3: EMEA\n`;

describe('what a sheet holds', () => {
  it('finds a value wherever it sits, in reading order', () => {
    expect(found(GRID, 'e')).toEqual(['A1', 'B1', 'A3']);
  });

  it('matches without case, which is what a reader means by it', () => {
    expect(found(GRID, 'apac')).toEqual(['A2']);
  });

  it('finds a number by the digits the spec holds', () => {
    expect(found(GRID, '2400000')).toEqual(['B2']);
  });

  it('finds a formula by what it says', () => {
    const spec = `${SALES}    cells:\n      B1: { formula: "SUM(A1:A2)" }\n`;
    expect(found(spec, 'sum(')).toEqual(['B1']);
  });

  it('finds a filled range at the anchor it is written at, and nowhere else', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n    formulas:\n      - at: C2:C9\n        formula: "A1*2"\n`;
    expect(found(spec, 'A1*2')).toEqual(['C2']);
  });

  it('names a cell once however many ways it holds the text', () => {
    const spec = `${SALES}    cells:\n      B1: { formula: "APAC", value: APAC }\n`;
    expect(found(spec, 'apac')).toEqual(['B1']);
  });

  it('finds nothing for nothing', () => {
    expect(found(GRID, '')).toEqual([]);
  });

  it('finds nothing where nothing holds it', () => {
    expect(found(GRID, 'LATAM')).toEqual([]);
  });
});
