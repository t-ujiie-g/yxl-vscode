import { type CompiledGrid, compile, type DataReader, type Setting } from '@yxl-vscode/compile';
import { parse } from '@yxl-vscode/cst';
import type { Diagnostic } from '@yxl-vscode/diag';
import { type IncludeReader, load } from '@yxl-vscode/loader';
import { applyPatch, type Patch } from '@yxl-vscode/patch';
import { type Change, changedAt, diff } from './diff';

/**
 * What a patch says it may change, and what to do about anything else.
 *
 * `cells` is the claim: `Sheet!A1` for each cell the edit is *for*. `beyond` is
 * what a change outside it means — a cell edit that ripples is worth asking
 * about, while a refactor that claims to change nothing and changes something
 * is a bug, and the only safe answer is no (ADR-009).
 */
export interface Expects {
  readonly cells: ReadonlySet<string>;
  readonly beyond: 'ask' | 'refuse';
}

/** A refactor's claim: this changes no cell at all, and one changed cell fails it. */
export const nothingChanges: Expects = { cells: new Set(), beyond: 'refuse' };

export interface Ctx {
  readonly file: string;
  readonly read: IncludeReader & DataReader;
  readonly params?: Setting;
}

/**
 * A patch checked, and — where the answer is yes — applied.
 *
 * `text` and `back` are present whenever the edit *can* be made, including when
 * it needs asking about: the caller that asks is the one holding the answer, and
 * recomputing the edit after the reader says yes would be the same work twice
 * over a file that may have moved.
 */
export type Checked =
  | {
      readonly ok: true;
      readonly text: string;
      readonly back: Patch;
      readonly changed: readonly Change[];
    }
  | {
      readonly ok: 'ask';
      readonly text: string;
      readonly back: Patch;
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
 * patch said it would move (ADR-009).
 *
 * This is the only way a write happens. Not because callers are asked to be
 * careful — because the function that applies a patch to a spec *is* this one,
 * and there is no other export that writes. A fast path for an edit that is
 * "obviously safe" is exactly the path an edit stops being safe on.
 */
export function checked(source: string, patch: Patch, expects: Expects, ctx: Ctx): Checked {
  const before = compiled(source, ctx);
  if (before === null) {
    return { ok: false, diagnostics: unreadable(source, ctx), surprises: [] };
  }

  const change = applyPatch(source, patch, { file: ctx.file });
  if (change.back === null) {
    return { ok: false, diagnostics: change.diagnostics, surprises: [] };
  }

  const after = compiled(change.text, ctx);
  if (after === null) {
    return { ok: false, diagnostics: unreadable(change.text, ctx), surprises: [] };
  }

  const broke = errorsBeyond(before.diagnostics, after.diagnostics);
  if (broke.length > 0) return { ok: false, diagnostics: broke, surprises: [] };

  const changed = diff(before.grid, after.grid);
  const surprises = changed.filter((one) => !covers(expects, one));
  if (surprises.length === 0) return { ok: true, text: change.text, back: change.back, changed };

  if (expects.beyond === 'refuse') return { ok: false, diagnostics: [], surprises };
  return { ok: 'ask', text: change.text, back: change.back, changed, surprises };
}

function covers(expects: Expects, change: Change): boolean {
  return change.kind === 'cell' && expects.cells.has(changedAt(change.sheet, change.at));
}

interface Read {
  readonly grid: CompiledGrid;
  readonly diagnostics: readonly Diagnostic[];
}

function compiled(source: string, ctx: Ctx): Read | null {
  const parsed = parse(source, { file: ctx.file });
  const loaded = load(parsed, ctx.read);
  if (loaded.doc === null) return null;

  const grid = compile(loaded.doc, { read: ctx.read, params: ctx.params ?? new Map() });
  return {
    grid,
    diagnostics: [...parsed.diagnostics, ...loaded.diagnostics, ...grid.diagnostics],
  };
}

function unreadable(source: string, ctx: Ctx): Diagnostic[] {
  const parsed = parse(source, { file: ctx.file });
  return [...parsed.diagnostics, ...load(parsed, ctx.read).diagnostics];
}

/**
 * The errors this edit is answerable for.
 *
 * A spec can be broken before the edit — a reader is mid-keystroke somewhere
 * else in the file — and refusing every edit until the rest of the file is
 * valid would make the editor useless exactly when it is most wanted. What is
 * refused is an error the edit *added*.
 */
function errorsBeyond(
  before: readonly Diagnostic[],
  after: readonly Diagnostic[],
): readonly Diagnostic[] {
  const had = new Set(before.map((one) => `${one.code}@${one.file}`));
  return after.filter((one) => !had.has(`${one.code}@${one.file}`));
}
