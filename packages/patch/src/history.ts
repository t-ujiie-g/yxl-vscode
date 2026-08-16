import type { Patch } from './patch';

/**
 * One edit that happened: the file it landed in, what was done, what takes it
 * back, and the cells it moved — which is what an undo of it may move, and no
 * more (ADR-009).
 */
export interface Step {
  readonly file: string;
  readonly patch: Patch;
  readonly back: Patch;
  readonly moved: readonly string[];
}

/**
 * What has been done and undone, as a value that holds no file and applies
 * nothing: a step says which patch to apply, and applying it goes through the
 * verification loop like every other write (ADR-009, ADR-010).
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

/** The last edit taken back, its inverse having been applied. */
export function took(history: History): History {
  const step = history.done.at(-1);
  if (step === undefined) return history;

  return { done: history.done.slice(0, -1), undone: [...history.undone, step] };
}

/** The last undone edit made again, as it was made this time: its inverse is the one worked out now. */
export function redid(history: History, step: Step): History {
  if (history.undone.length === 0) return history;

  return { done: [...history.done, step], undone: history.undone.slice(0, -1) };
}
