import type { Op } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { did, type History, nothing, redo, undo } from './history';
import { applyPatch, type Patch } from './patch';

const FILE = 'spec.yxl.yaml';
const SPEC = 'params:\n  region: APAC\n  quarter: Q3\n';

/** Make an edit the way a caller would: apply it, then remember it. */
function edit(source: string, history: History, ...ops: Op[]) {
  const change = applyPatch(source, { ops }, { file: FILE });
  expect(change.back).not.toBeNull();

  return {
    text: change.text,
    history: did(history, { patch: { ops }, back: change.back as Patch }),
  };
}

describe('a history of edits', () => {
  it('has nothing to undo before anything is done', () => {
    expect(undo(SPEC, nothing, { file: FILE })).toBeNull();
  });

  it('takes back the last edit', () => {
    const one = edit(SPEC, nothing, { op: 'set', path: ['params', 'region'], value: 'EMEA' });
    expect(undo(one.text, one.history, { file: FILE })?.text).toBe(SPEC);
  });

  it('takes them back one at a time, last first', () => {
    const one = edit(SPEC, nothing, { op: 'set', path: ['params', 'region'], value: 'EMEA' });
    const two = edit(one.text, one.history, {
      op: 'set',
      path: ['params', 'quarter'],
      value: 'Q4',
    });

    const back = undo(two.text, two.history, { file: FILE });
    expect(back?.text).toBe(one.text);

    expect(undo(back?.text ?? '', back?.history ?? nothing, { file: FILE })?.text).toBe(SPEC);
  });

  it('puts an undone edit back on', () => {
    const one = edit(SPEC, nothing, { op: 'set', path: ['params', 'region'], value: 'EMEA' });
    const back = undo(one.text, one.history, { file: FILE });
    const again = redo(back?.text ?? '', back?.history ?? nothing, { file: FILE });

    expect(again?.text).toBe(one.text);
  });

  it('has nothing to redo once another edit is made', () => {
    const one = edit(SPEC, nothing, { op: 'set', path: ['params', 'region'], value: 'EMEA' });
    const back = undo(one.text, one.history, { file: FILE });
    const other = edit(back?.text ?? '', back?.history ?? nothing, {
      op: 'set',
      path: ['params', 'quarter'],
      value: 'Q4',
    });

    expect(redo(other.text, other.history, { file: FILE })).toBeNull();
  });

  it('undoes against the file as it is now, not as it was', () => {
    // The other line was edited by hand between the edit and the undo. Undo is
    // ops against a path, not a saved copy of the file, so the hand edit stays.
    const one = edit(SPEC, nothing, { op: 'set', path: ['params', 'region'], value: 'EMEA' });
    const byHand = one.text.replace('quarter: Q3', 'quarter: Q4');

    expect(undo(byHand, one.history, { file: FILE })?.text).toBe(
      'params:\n  region: APAC\n  quarter: Q4\n',
    );
  });

  it('keeps a step that no longer fits, rather than swallowing it', () => {
    // The key it addresses was renamed by hand, so the undo cannot land. The
    // history is left as it was: a reader can see what happened and decide.
    const one = edit(SPEC, nothing, { op: 'set', path: ['params', 'region'], value: 'EMEA' });
    const byHand = one.text.replace('region:', 'area:');
    const back = undo(byHand, one.history, { file: FILE });

    expect(back?.text).toBe(byHand);
    expect(back?.history.done).toHaveLength(1);
    expect(back?.diagnostics).not.toEqual([]);
  });
});
