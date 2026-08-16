import { type History, redid, took } from '@yxl-vscode/patch';
import { filePath } from '@yxl-vscode/units';
import { checked } from '@yxl-vscode/verify';
import { moved, type Port, type Spec } from './write';

/** Where the grid's undo landed, and the history it left behind. */
export interface Taken {
  readonly at: 'here' | 'shell' | 'nowhere';
  readonly history: History;
}

/**
 * The last edit taken back, or put on again, in the file itself — while this
 * editor is still the last thing to have touched it. Where it is not, the
 * editor's own undo is the only honest one and this says so (ADR-030).
 */
export async function goBack(
  spec: Spec,
  history: History,
  redoing: boolean,
  port: Port,
): Promise<Taken> {
  const step = (redoing ? history.undone : history.done).at(-1);
  if (step === undefined) {
    return { at: owns(history, redoing, port) ? 'nowhere' : 'shell', history };
  }

  const file = filePath(step.file);
  if (file === null) return { at: 'shell', history };

  const source = port.text(file);
  if (source === null || source !== port.left(file)) return { at: 'shell', history };

  const done = checked(
    source,
    redoing ? step.patch : step.back,
    { cells: new Set(step.moved), beyond: 'refuse' },
    { root: spec.root, file, read: spec.read, params: spec.params },
  );
  if (done.ok === false || done.back === null) return { at: 'shell', history };

  await port.put(file, done.text);
  return {
    at: 'here',
    history: redoing
      ? redid(history, { ...step, back: done.back, moved: moved(done.changed) })
      : took(history),
  };
}

/** Whether this editor still holds the file its history ends at, with nothing on this side left to take. */
function owns(history: History, redoing: boolean, port: Port): boolean {
  const step = (redoing ? history.done : history.undone).at(-1);
  const file = step === undefined ? null : filePath(step.file);
  if (file === null) return false;

  const now = port.text(file);
  return now !== null && now === port.left(file);
}
