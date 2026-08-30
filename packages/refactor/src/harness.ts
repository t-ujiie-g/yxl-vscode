/** The fixtures a proposal's tests are built on: a spec as text, loaded and compiled as the host loads it. */
import { compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type Saying, reading as wording } from '@yxl-vscode/diag';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { applyPatch, type Patch } from '@yxl-vscode/patch';
import { type FilePath, filePath, type StyleName, styleName } from '@yxl-vscode/units';
import { type Ctx, checked, nothingChanges } from '@yxl-vscode/verify';
import type { Proposing } from './proposal';
import { WORDS } from './text';

/** What this package said, in the language a test reads its own assertions in. */
export const english: (saying: Saying) => string = wording('en', WORDS);

/** The file a one-file spec is written in. */
export const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);

/** A spec as a test writes one: the root file's text, or a file per name. */
export type Written = string | Record<string, string>;

/** A spec loaded and compiled, with what a proposal and the checker each need of it. */
export interface Loaded extends Proposing {
  readonly ctx: Ctx;
  readonly source: string;
}

export function spec(of: Written): Loaded {
  const sources = typeof of === 'string' ? { [ROOT]: of } : of;
  const read: IncludeReader = (_from, path) =>
    sources[path] === undefined ? null : { file: filePath(path) ?? ROOT, source: sources[path] };

  const trees = new Map<string, ReturnType<typeof parse>>();
  const parsed = (file: FilePath) => {
    if (!trees.has(file)) trees.set(file, parse(sources[file] ?? '', { file }));
    return trees.get(file) ?? null;
  };

  const { doc } = load(parse(sources[ROOT] ?? '', { file: ROOT }), read);
  if (doc === null) throw new Error('did not load');

  return {
    doc,
    grid: compile(doc, { read }),
    parsed,
    ctx: { root: ROOT, file: ROOT, read },
    source: sources[ROOT] ?? '',
  };
}

/** A name a test names, which is a name this package would have refused as one. */
export function named(name: string): StyleName {
  const read = styleName(name);
  if (read === null) throw new Error(`not a style name: ${name}`);
  return read;
}

/** A patch taken over a spec: the file it leaves behind, and whether the gate let it through. */
export function taken(of: Loaded, patch: Patch): { text: string; passes: boolean } {
  const gate = checked(of.source, patch, nothingChanges, of.ctx);

  return { text: applyPatch(of.source, patch, { file: ROOT }).text, passes: gate.ok === true };
}
