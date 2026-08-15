import type { Applied } from '@yxl-vscode/cst';
import { applyPatch, type Options, type Patch } from './patch';

/** One edit that happened: what was done, and what would take it back. */
export interface Step {
  readonly patch: Patch;
  readonly back: Patch;
}

/**
 * What has been done and what has been undone, as a value.
 *
 * Nothing here holds a *file*. An undo is worked out against whatever the text
 * is at the moment it is asked for, not against a copy taken when the edit was
 * made — which is what lets a hand edit and a grid edit interleave without one
 * of them silently winning (ADR-010).
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

/**
 * Undo the last edit, against the file as it is now.
 *
 * The step is only counted as undone if it applied cleanly; a step that no
 * longer fits — its path edited away by hand since — leaves the history where
 * it was, so the reader can look at what happened rather than find their undo
 * stack quietly one shorter.
 */
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

/**
 * Redo the last undone edit.
 *
 * Its own inverse is worked out again as it goes back on, rather than reused
 * from before: the file may have moved on since, and the undo that follows has
 * to put back what is there *now*.
 */
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
