import { describe, expect, it } from 'vitest';
import { did, nothing, redid, type Step, took } from './history';

const FILE = 'spec.yxl.yaml';

const step = (key: string, value: string): Step => ({
  file: FILE,
  patch: { ops: [{ op: 'set', path: ['params', key], value }] },
  back: { ops: [{ op: 'set', path: ['params', key], value: 'APAC' }] },
  moved: [`Sales!${key}`],
});

describe('a history of edits', () => {
  it('has nothing to take back before anything is done', () => {
    expect(nothing.done).toEqual([]);
    expect(nothing.undone).toEqual([]);
  });

  it('keeps what was done, last last', () => {
    const one = step('region', 'EMEA');
    const two = step('quarter', 'Q4');

    expect(did(did(nothing, one), two).done).toEqual([one, two]);
  });

  it('moves the last edit to the undone side, and leaves the rest', () => {
    const one = step('region', 'EMEA');
    const two = step('quarter', 'Q4');
    const back = took(did(did(nothing, one), two));

    expect(back.done).toEqual([one]);
    expect(back.undone).toEqual([two]);
  });

  it('takes back nothing where nothing was done', () => {
    expect(took(nothing)).toEqual(nothing);
  });

  it('puts an undone edit back on, with the inverse worked out this time', () => {
    const one = step('region', 'EMEA');
    const again = { ...one, back: { ops: [] }, moved: ['Sales!A1'] };
    const done = redid(took(did(nothing, one)), again);

    expect(done.done).toEqual([again]);
    expect(done.undone).toEqual([]);
  });

  it('puts nothing back on where nothing was undone', () => {
    const one = step('region', 'EMEA');
    expect(redid(did(nothing, one), one).done).toEqual([one]);
  });

  it('forgets what was undone once another edit is made', () => {
    const one = step('region', 'EMEA');
    const other = step('quarter', 'Q4');

    expect(did(took(did(nothing, one)), other).undone).toEqual([]);
  });
});
