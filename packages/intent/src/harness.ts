/** The fixtures a write's tests are built on: a spec as text, and what a gesture needs of it. */
import { type CompiledGrid, compile } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import type { SpecDoc } from '@yxl-vscode/spec';
import { type FilePath, filePath } from '@yxl-vscode/units';
import { type Checked, type Ctx, checked } from '@yxl-vscode/verify';
import { type Intent, type Reading, reading, type Text } from './direct';

/** The spec these tests edit, which is the file a one-file spec is written in. */
export const ROOT = filePath('spec.yxl.yaml') ?? ('' as FilePath);

/** A spec as a test writes one: the root file's text, or a file per name. */
export type Written = string | Record<string, string>;

/**
 * A spec loaded and compiled, with the readings a write takes: `read` is what a
 * gesture is given, `includes` what the checker reads the spec again through.
 */
export function files(of: Written): {
  doc: SpecDoc;
  grid: CompiledGrid;
  text: Text;
  read: Reading;
  includes: IncludeReader;
} {
  const sources = typeof of === 'string' ? { [ROOT]: of } : of;
  const text: Text = (file) => sources[file] ?? null;
  const includes: IncludeReader = (_from, path) =>
    sources[path] === undefined ? null : { file: filePath(path) ?? ROOT, source: sources[path] };

  const { doc } = load(parse(sources[ROOT] ?? '', { file: ROOT }), includes);
  if (doc === null) throw new Error('did not load');

  return { doc, grid: compile(doc, { read: includes }), text, read: reading(text), includes };
}

/** An intent taken through the checker, which is the half of a write the host does. */
export function checking(of: Written, intent: Intent & { kind: 'edit' }): Checked {
  const { text, includes } = files(of);
  const ctx: Ctx = { root: ROOT, file: intent.file, read: includes };

  return checked(text(intent.file) ?? '', intent.patch, intent.expects, ctx);
}

/** The file as it stands after the intent, or `refused:` and why — for a test that asserts on both. */
export function tried(of: Written, intent: Intent): string {
  if (intent.kind === 'refused') return `refused: ${intent.why}`;
  if (intent.kind !== 'edit') throw new Error('a file was not written');

  const done = checking(of, intent);
  return done.ok === false ? `refused: ${done.diagnostics[0]?.message ?? 'a surprise'}` : done.text;
}

/** The same where the test is not about a refusal: the file, or a throw naming what stood in the way. */
export function wrote(of: Written, intent: Intent): string {
  if (intent.kind === 'refused') throw new Error(`refused: ${intent.why}`);
  if (intent.kind !== 'edit') throw new Error('a file was not written');

  const done = checking(of, intent);
  if (done.ok === false) {
    throw new Error(`the checker refused it: ${done.diagnostics[0]?.message ?? 'a surprise'}`);
  }

  return done.text;
}
