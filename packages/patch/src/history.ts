import type { Applied } from '@yxl-vscode/cst';
import { applyPatch, type Options, type Patch } from './patch';

/** One edit that happened: what was done, and what would take it back. */
export interface Step {
  readonly patch: Patch;
  readonly back: Patch;
}

/**
 * What has been done and undone, as a value holding no file: an undo is worked
 * out against the text as it is when asked for (ADR-010).
 */
export interface History {
  readonly done: readonly Step[];
  readonly undone: readonly Step[];
}

export const nothing: History = { done: [], undone: [] };

/** An edit that has just been made, with everything undone forgotten. */
export function did(history: History, step: Step): History {
  return { done: [...history.done, step], undone: [] };
}

/** A step taken, or `null` where there was none to take. */
export interface Went extends Applied {
  readonly history: History;
}

/** Undo the last edit against the file as it is now; a step that no longer fits leaves the history as it was. */
export function undo(source: string, history: History, options: Options): Went | null {
  const step = history.done[history.done.length - 1];
  if (step === undefined) return null;

  const change = applyPatch(source, step.back, options);
  if (change.back === null) return { ...change, history };

  return {
    ...change,
    history: { done: history.done.slice(0, -1), undone: [...history.undone, step] },
  };
}

/** Redo the last undone edit, its inverse worked out again against the file as it is now. */
export function redo(source: string, history: History, options: Options): Went | null {
  const step = history.undone[history.undone.length - 1];
  if (step === undefined) return null;

  const change = applyPatch(source, step.patch, options);
  if (change.back === null) return { ...change, history };

  return {
    ...change,
    history: {
      done: [...history.done, { patch: step.patch, back: change.back }],
      undone: history.undone.slice(0, -1),
    },
  };
}
