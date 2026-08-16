import { type CompiledGrid, compile, type DataReader, type Setting } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import type { Diagnostic } from '@yxl-vscode/diag';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { applyPatch, type Patch } from '@yxl-vscode/patch';
import { type FilePath, qualified } from '@yxl-vscode/units';
import { type Change, diff } from './diff';

/**
 * What a patch says it may change — `cells`, as `Sheet!A1` — and what a change
 * beyond that means: ask about it, or refuse (ADR-009).
 */
export interface Expects {
  readonly cells: ReadonlySet<string>;
  readonly beyond: 'ask' | 'refuse';
}

/** A refactor's claim: this changes no cell at all, and one changed cell fails it. */
export const nothingChanges: Expects = { cells: new Set(), beyond: 'refuse' };

/**
 * The spec being edited. `root` is what gets compiled, even when the edit lands
 * in a file it `$include`s: a fragment on its own has no cells to compare.
 */
export interface Ctx {
  readonly root: FilePath;
  readonly file: FilePath;
  readonly read: IncludeReader & DataReader;
  readonly params?: Setting;
}

/**
 * A patch checked. `text` is present whenever the edit *can* be made, asked
 * about or not; `back` takes it off again, and is `null` for a file this
 * algebra does not address, whose undo is the shell's.
 */
export type Checked =
  | {
      readonly ok: true;
      readonly text: string;
      readonly back: Patch | null;
      readonly changed: readonly Change[];
    }
  | {
      readonly ok: 'ask';
      readonly text: string;
      readonly back: Patch | null;
      readonly changed: readonly Change[];
      readonly surprises: readonly Change[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly Diagnostic[];
      readonly surprises: readonly Change[];
    };

/**
 * Compile before, apply, compile after, and compare what moved against what the
 * patch said it would move (ADR-009). The only export that writes a spec.
 */
export function checked(source: string, patch: Patch, expects: Expects, ctx: Ctx): Checked {
  const before = compiled(ctx, source);
  if (before === null) {
    return { ok: false, diagnostics: unreadable(ctx, source), surprises: [] };
  }

  const change = applyPatch(source, patch, { file: ctx.file });
  if (change.back === null) {
    return { ok: false, diagnostics: change.diagnostics, surprises: [] };
  }

  return against(before, change.text, change.back, expects, ctx);
}

/**
 * The same check for a file the spec *reads*, which has no patch algebra: what
 * arrives is the file as it should be, and the undo is the shell's.
 */
export function checkedText(source: string, text: string, expects: Expects, ctx: Ctx): Checked {
  const before = compiled(ctx, source);
  if (before === null) {
    return { ok: false, diagnostics: unreadable(ctx, source), surprises: [] };
  }

  return against(before, text, null, expects, ctx);
}

function against(
  before: Read,
  text: string,
  back: Patch | null,
  expects: Expects,
  ctx: Ctx,
): Checked {
  const after = compiled(ctx, text);
  if (after === null) return { ok: false, diagnostics: unreadable(ctx, text), surprises: [] };

  const broke = errorsBeyond(before.diagnostics, after.diagnostics);
  if (broke.length > 0) return { ok: false, diagnostics: broke, surprises: [] };

  const changed = diff(before.grid, after.grid);
  const surprises = changed.filter((one) => !covers(expects, one));
  if (surprises.length === 0) return { ok: true, text, back, changed };

  if (expects.beyond === 'refuse') return { ok: false, diagnostics: [], surprises };
  return { ok: 'ask', text, back, changed, surprises };
}

function covers(expects: Expects, change: Change): boolean {
  return change.kind === 'cell' && expects.cells.has(qualified(change.sheet, change.at));
}

interface Read {
  readonly grid: CompiledGrid;
  readonly diagnostics: readonly Diagnostic[];
}

/** The whole spec compiled, with one file's text taken from the edit. */
function compiled(ctx: Ctx, edited: string): Read | null {
  const read = overlaid(ctx, edited);
  const parsed = parse(root(ctx, edited), { file: ctx.root });
  const loaded = load(parsed, read);
  if (loaded.doc === null) return null;

  const grid = compile(loaded.doc, { read, params: ctx.params ?? new Map() });
  return {
    grid,
    diagnostics: [...parsed.diagnostics, ...loaded.diagnostics, ...grid.diagnostics],
  };
}

function root(ctx: Ctx, edited: string): string {
  if (ctx.file === ctx.root) return edited;

  const read = ctx.read(ctx.root, ctx.root);
  return read?.source ?? '';
}

function overlaid(ctx: Ctx, edited: string): IncludeReader & DataReader {
  if (ctx.file === ctx.root) return ctx.read;

  return (from, path) => {
    const found = ctx.read(from, path);
    if (found === null) return null;

    return found.file === ctx.file ? { ...found, source: edited } : found;
  };
}

function unreadable(ctx: Ctx, edited: string): Diagnostic[] {
  const parsed = parse(root(ctx, edited), { file: ctx.root });
  return [...parsed.diagnostics, ...load(parsed, overlaid(ctx, edited)).diagnostics];
}

/** The errors the edit *added*: a spec broken elsewhere, mid-keystroke, still takes edits. */
function errorsBeyond(
  before: readonly Diagnostic[],
  after: readonly Diagnostic[],
): readonly Diagnostic[] {
  const had = new Set(before.map((one) => `${one.code}@${one.file}`));
  return after.filter((one) => !had.has(`${one.code}@${one.file}`));
}
