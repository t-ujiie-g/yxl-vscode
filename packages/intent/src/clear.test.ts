import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { applyPatch } from '@yxl-vscode/patch';
import { type A1Addr, type FilePath, filePath, type SheetName } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { clearCell } from './clear';
import type { Intent, Text } from './direct';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);
const SALES = 'sheets:\n  - name: Sales\n';

function files(sources: Record<string, string>) {
  const text: Text = (file) => sources[file] ?? null;
  const read: IncludeReader = (_from, path) =>
    sources[path] === undefined ? null : { file: filePath(path) ?? ROOT, source: sources[path] };

  const { doc } = load(parse(sources[ROOT] ?? '', { file: ROOT }), read);
  if (doc === null) throw new Error('did not load');

  return { grid: compile(doc, { read }), text, read };
}

function emptied(source: string, at: string): Intent {
  const { grid, text } = files({ [ROOT]: source });
  return clearCell(grid, { sheet: 'Sales' as SheetName, at: at as A1Addr }, text);
}

/** The gesture taken all the way through the checker, which is the only way in. */
function after(source: string, at: string): string {
  const intent = emptied(source, at);
  if (intent.kind === 'refused') throw new Error(`refused: ${intent.why}`);
  if (intent.kind !== 'edit') throw new Error('a file was written, not a spec');

  const { read } = files({ [ROOT]: source });
  const ctx: Ctx = { root: ROOT, file: intent.file, read };
  const done = checked(source, intent.patch, intent.expects, ctx);
  if (done.ok === false) throw new Error(`the checker refused it: ${done.diagnostics[0]?.message}`);
  if (done.ok === 'ask') throw new Error('the checker was surprised by it');

  return done.text;
}

describe('a cell emptied', () => {
  it('takes the entry out, because a cell with nothing in it cannot be written', () => {
    const spec = `${SALES}    cells:\n      A1: APAC\n      B1: 1\n`;
    expect(after(spec, 'A1')).toBe(`${SALES}    cells:\n      B1: 1\n`);
  });

  it('keeps the look and loses what was in it', () => {
    // `docs/spec.md` §3: a style with no value is a blank cell that is styled,
    // which is what a spreadsheet leaves behind when you press Delete.
    const spec = `${SALES}    cells:\n      A1:\n        value: APAC\n        style: header\n      B1: 1\n`;
    expect(after(spec, 'A1')).toBe(
      `${SALES}    cells:\n      A1:\n        style: header\n      B1: 1\n`,
    );
  });

  it('keeps the look of a cell written in the flow form, which is how the docs write it', () => {
    const spec = `${SALES}    cells:\n      B4: { value: 0.085, format: "0.0%" }\n      B5: 1\n`;
    expect(after(spec, 'B4')).toBe(
      `${SALES}    cells:\n      B4: { format: "0.0%" }\n      B5: 1\n`,
    );
  });

  it('takes the whole entry where nothing but content is in it', () => {
    const spec = `${SALES}    cells:\n      A1:\n        formula: "B1*2"\n        value: 2\n      B1: 1\n`;
    expect(after(spec, 'A1')).toBe(`${SALES}    cells:\n      B1: 1\n`);
  });

  it('takes the type with the value it applied to', () => {
    const spec = `${SALES}    cells:\n      A1:\n        value: "2026-07-23"\n        type: date\n        style: header\n      B1: 1\n`;
    const written = after(spec, 'A1');

    expect(written).toContain('        style: header\n');
    expect(written).not.toContain('type: date');
  });

  it('writes `null` into a `data:` block, which is that format’s own blank', () => {
    // `docs/spec.md` §9: a null in a row is a blank cell, so the block keeps its
    // shape rather than losing a field.
    const spec = `${SALES}    data:\n      - at: A1\n        values:\n          - [APAC, 1]\n          - [EMEA, 2]\n`;
    expect(after(spec, 'A1')).toContain('- [null, 1]');
  });

  it('is undone by putting back the lines it took', () => {
    const spec = `${SALES}    cells:\n      A1:\n        value: APAC\n        style: header\n      B1: 1\n`;
    const intent = emptied(spec, 'A1');
    if (intent.kind !== 'edit') throw new Error('refused');

    const done = applyPatch(spec, intent.patch, { file: ROOT });
    expect(done.diagnostics).toEqual([]);
    if (done.back === null) throw new Error('no way back');

    expect(applyPatch(done.text, done.back, { file: ROOT }).text).toBe(spec);
  });
});

describe('what emptying will not do', () => {
  it('refuses a cell a range fills, which is not this cell to take out', () => {
    const spec = `${SALES}    cells:\n      A1: 1\n    formulas:\n      - at: B1:B2\n        formula: "A1"\n`;
    const intent = emptied(spec, 'B2');

    expect(intent.kind === 'refused' && intent.why).toContain('filled by the range');
  });

  it('refuses the only cell a sheet has, which would leave `cells:` with nothing', () => {
    const spec = `${SALES}    cells:\n      A1: APAC\n`;
    const intent = emptied(spec, 'A1');
    if (intent.kind !== 'edit') throw new Error('it should be tried and refused, not withheld');

    const { read } = files({ [ROOT]: spec });
    const done = checked(spec, intent.patch, intent.expects, { root: ROOT, file: ROOT, read });

    expect(done.ok).toBe(false);
  });
});
