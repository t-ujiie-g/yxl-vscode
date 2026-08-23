import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { type FilePath, filePath } from '@yxl-vscode/units';
import { type Ctx, checked } from '@yxl-vscode/verify';
import { describe, expect, it } from 'vitest';
import { reading } from './direct';
import { addSheet } from './sheets';

const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);

function files(source: string) {
  const includes: IncludeReader = (_from, path) => (path === ROOT ? { file: ROOT, source } : null);
  const { doc } = load(parse(source, { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return { doc, grid: compile(doc, { read: includes }), read: reading(() => source), includes };
}

/** The sheet added, through the checker — the file, or why not. */
function added(source: string, name: string): string {
  const { doc, grid, read } = files(source);
  const intent = addSheet({ doc, grid }, { name }, read);
  if (intent.kind === 'refused') return `refused: ${intent.why}`;
  if (intent.kind !== 'edit') throw new Error('a file was not written');

  const { includes } = files(source);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };
  const done = checked(source, intent.patch, intent.expects, ctx);

  return done.ok === false ? `refused: ${done.diagnostics[0]?.message ?? 'a surprise'}` : done.text;
}

const ONE = 'sheets:\n  - name: Sales\n    cells:\n      A1: 1\n';

describe('a sheet added', () => {
  it('goes last in the list, which is tab order, holding nothing yet', () => {
    expect(added(ONE, 'Notes')).toBe(`${ONE}  - name: Notes\n`);
  });

  it('is written as the spec would quote it, where the name needs quoting', () => {
    expect(added(ONE, 'Q3 data')).toContain('  - name: Q3 data\n');
    expect(added(ONE, 'true')).toContain('  - name: "true"\n');
  });

  it('is refused under a name a sheet already has, which the compiler refuses too', () => {
    expect(added(ONE, 'Sales')).toBe('refused: there is already a sheet named `Sales`');
  });

  it('is refused under a name a sheet cannot have, saying which rule', () => {
    expect(added(ONE, 'A:B')).toBe('refused: a sheet name cannot hold `:`');
    expect(added(ONE, '')).toBe('refused: a sheet needs a name');
    expect(added(ONE, 'History')).toBe('refused: `History` is a name Excel keeps for itself');
  });
});
