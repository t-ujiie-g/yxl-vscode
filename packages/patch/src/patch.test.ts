import type { Op } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { applyPatch, invert, type Patch, rewrites } from './patch';

const FILE = 'spec.yxl.yaml';

const SPEC = `# A quarterly report
params:
  region: APAC      # overridden per build
sheets:
  - name: Sales
    cells:
      A1: Revenue
      B1: 2400000
      C1: "007"
`;

function changed(source: string, ...ops: Op[]) {
  return applyPatch(source, { ops }, { file: FILE });
}

/** Apply a patch and then its own inverse, which should leave the file alone. */
function roundTrip(source: string, ...ops: Op[]): string {
  const there = changed(source, ...ops);
  expect(there.diagnostics).toEqual([]);
  expect(there.back).not.toBeNull();

  const back = applyPatch(there.text, there.back as Patch, { file: FILE });
  expect(back.diagnostics).toEqual([]);
  return back.text;
}

describe('applying a patch', () => {
  it('changes the file and says what would change it back', () => {
    const done = changed(SPEC, { op: 'set', path: ['params', 'region'], value: 'EMEA' });

    expect(done.text).toContain('region: EMEA');
    expect(done.back?.ops).toEqual([{ op: 'write', path: ['params', 'region'], source: 'APAC' }]);
  });

  it('undoes to the byte, comments and quoting included', () => {
    expect(roundTrip(SPEC, { op: 'set', path: ['params', 'region'], value: 'EMEA' })).toBe(SPEC);
  });

  it('puts back the text a value was written as, not a rendering of it', () => {
    // `1.50` and `1.5` are one value and two files; an undo that wrote the
    // shorter one would be an edit nobody asked for.
    const source = 'params:\n  rate: 1.50\n';
    expect(roundTrip(source, { op: 'set', path: ['params', 'rate'], value: 2 })).toBe(source);
  });

  it('undoes a value that was quoted back into its quotes', () => {
    const path = ['sheets', 0, 'cells', 'C1'];
    expect(roundTrip(SPEC, { op: 'set', path, value: '008' })).toBe(SPEC);
  });

  it('undoes a rename', () => {
    const path = ['sheets', 0, 'cells', 'B1'];
    expect(roundTrip(SPEC, { op: 'renameKey', path, to: 'B2' })).toBe(SPEC);
  });

  it('undoes an entry back to where it was, not to the end', () => {
    const path = ['sheets', 0, 'cells', 'B1'];
    expect(roundTrip(SPEC, { op: 'remove', path })).toBe(SPEC);
  });

  it('undoes an entry that holds a mapping, subtree and all', () => {
    const source = 'cells:\n  A1:\n    value: 1\n    style: header\n  B1: 2\n';
    expect(roundTrip(source, { op: 'remove', path: ['cells', 'A1'] })).toBe(source);
  });

  it('undoes an entry back into the quoting it was written with', () => {
    // `add` would have put back the *value*, and `'007'` and `007` are one
    // value and two files.
    const source = "cells:\n  A1: '007'\n  B1: 2\n";
    expect(roundTrip(source, { op: 'remove', path: ['cells', 'A1'] })).toBe(source);
  });

  it('undoes a removed entry back under the comment that introduces it', () => {
    const source = 'cells:\n  A1: 1\n  # the total\n  B1: 2\n  C1: 3\n';
    expect(roundTrip(source, { op: 'remove', path: ['cells', 'B1'] })).toBe(source);
  });

  it('undoes a removed sequence item, comments and all', () => {
    const source = 'sheets:\n  - Sales\n  # the derived one\n  - Costs\n  - Summary\n';
    expect(roundTrip(source, { op: 'remove', path: ['sheets', 1] })).toBe(source);
  });

  it('undoes an added entry by taking it away again', () => {
    const add = {
      op: 'add',
      path: ['sheets', 0, 'cells'],
      key: 'D1',
      value: 'Share',
      before: null,
    } as const;

    expect(roundTrip(SPEC, add)).toBe(SPEC);
  });

  it('undoes a cleared value back to the value it had', () => {
    expect(roundTrip(SPEC, { op: 'clear', path: ['sheets', 0, 'cells', 'A1'] })).toBe(SPEC);
  });

  it('undoes a key that had no value back to having none', () => {
    const source = 'cells:\n  A1:\n  B1: 2\n';
    expect(roundTrip(source, { op: 'set', path: ['cells', 'A1'], value: 'x' })).toBe(source);
  });

  it('undoes several ops in the order they went on', () => {
    const source = 'a: 1\nb: 2\n';
    const both: Op[] = [
      { op: 'set', path: ['a'], value: 9 },
      { op: 'set', path: ['b'], value: 8 },
    ];

    expect(roundTrip(source, ...both)).toBe(source);
  });
});

describe('what will not be applied', () => {
  it('refuses to remove the only entry, which would have nothing to come back to', () => {
    const source = 'cells:\n  A1: 1\n';
    const done = changed(source, { op: 'remove', path: ['cells', 'A1'] });

    expect(done.text).toBe(source);
    expect(done.diagnostics[0]?.code).toBe(CODE.noInverse);
    expect(done.back).toBeNull();
  });

  it('refuses a removal whose lines could not go back where they were', () => {
    // The blank line stays behind, and a last entry goes back after the one
    // before it — which would put it above the gap it used to be under.
    const source = 'cells:\n  A1: 1\n\n  B1: 2\n';
    const done = changed(source, { op: 'remove', path: ['cells', 'B1'] });

    expect(done.text).toBe(source);
    expect(done.diagnostics[0]?.code).toBe(CODE.noInverse);
  });

  it('refuses an edit to a path that is not there', () => {
    const done = changed(SPEC, { op: 'set', path: ['params', 'nosuch'], value: 1 });

    expect(done.text).toBe(SPEC);
    expect(done.back).toBeNull();
  });

  it('leaves the file alone when one op of several cannot be applied', () => {
    const done = changed(
      SPEC,
      { op: 'set', path: ['params', 'region'], value: 'EMEA' },
      { op: 'set', path: ['params', 'nosuch'], value: 1 },
    );

    expect(done.text).toBe(SPEC);
  });

  it('has nothing to say about a file it cannot read', () => {
    const done = changed('a: [\n', { op: 'set', path: ['a'], value: 1 });
    expect([done.text, done.back]).toEqual(['a: [\n', null]);
  });
});

describe('the inverse itself', () => {
  it('is the ops in reverse, so ops that touch each other come apart in order', () => {
    const source = 'cells:\n  A1: 1\n';
    const patch: Patch = {
      ops: [
        { op: 'add', path: ['cells'], key: 'A2', value: 2, before: null },
        { op: 'set', path: ['cells', 'A1'], value: 9 },
      ],
    };

    expect(invert(source, patch, { file: FILE }).patch?.ops).toEqual([
      { op: 'write', path: ['cells', 'A1'], source: '1' },
      { op: 'remove', path: ['cells', 'A2'] },
    ]);
  });

  it('names where an entry goes back, so a removal is undone in place', () => {
    const source = 'cells:\n  A1: 1\n  A2: 2\n  A3: 3\n';
    const patch: Patch = { ops: [{ op: 'remove', path: ['cells', 'A2'] }] };

    expect(invert(source, patch, { file: FILE }).patch?.ops).toEqual([
      { op: 'restore', path: ['cells'], key: 'A2', before: 'A3', source: '  A2: 2\n' },
    ]);
  });

  it('puts back a last entry with nothing to go before', () => {
    const source = 'cells:\n  A1: 1\n  A2: 2\n';
    const patch: Patch = { ops: [{ op: 'remove', path: ['cells', 'A2'] }] };

    expect(invert(source, patch, { file: FILE }).patch?.ops).toEqual([
      { op: 'restore', path: ['cells'], key: 'A2', before: null, source: '  A2: 2\n' },
    ]);
  });

  it('puts back the lines a removal took, subtree and all', () => {
    const source = 'cells:\n  A1:\n    value: 1\n    style: header\n  B1: 2\n';
    const patch: Patch = { ops: [{ op: 'remove', path: ['cells', 'A1'] }] };

    expect(invert(source, patch, { file: FILE }).patch?.ops).toEqual([
      {
        op: 'restore',
        path: ['cells'],
        key: 'A1',
        before: 'B1',
        source: '  A1:\n    value: 1\n    style: header\n',
      },
    ]);
  });

  it('undoes a restore by taking the entry away again', () => {
    const source = 'cells:\n  A1: 1\n  B1: 2\n';
    const put = {
      op: 'restore',
      path: ['cells'],
      key: 'A2',
      before: 'B1',
      source: '  A2: 2\n',
    } as const;

    expect(invert(source, { ops: [put] }, { file: FILE }).patch?.ops).toEqual([
      { op: 'remove', path: ['cells', 'A2'] },
    ]);
  });

  it('undoes an insert by removing what it put in', () => {
    const source = 'names:\n  - Sales\n';
    const patch: Patch = { ops: [{ op: 'insert', path: ['names'], index: 1, value: 'Costs' }] };

    expect(invert(source, patch, { file: FILE }).patch?.ops).toEqual([
      { op: 'remove', path: ['names', 1] },
    ]);
  });
});

describe('undoing a patch that removes more than one entry', () => {
  const CELLS = 'cells:\n  A1: 1\n  B1: 2\n  A2: 3\n  C1: keep\n';
  const removing = (...keys: string[]) => ({
    ops: keys.map((key) => ({ op: 'remove', path: ['cells', key] }) as const),
  });

  it('puts every one of them back, in the order they were written', () => {
    const done = applyPatch(CELLS, removing('A1', 'B1', 'A2'), { file: FILE });
    expect(done.text).toBe('cells:\n  C1: keep\n');
    if (done.back === null) throw new Error('no way back');

    expect(applyPatch(done.text, done.back, { file: FILE }).text).toBe(CELLS);
  });

  it('anchors each one on a sibling the patch is not also taking out', () => {
    const { patch } = invert(CELLS, removing('A1', 'B1'), { file: FILE });
    const anchors = patch?.ops.map((one) => (one.op === 'restore' ? one.before : one.op));

    // `A1` went back above `A2`, not above the `B1` that goes with it.
    expect(anchors).toEqual(['A2', 'A2']);
  });

  it('appends where nothing after them survives', () => {
    const done = applyPatch(CELLS, removing('B1', 'A2', 'C1'), { file: FILE });
    if (done.back === null) throw new Error('no way back');

    expect(applyPatch(done.text, done.back, { file: FILE }).text).toBe(CELLS);
  });
});

describe('how much of a file a patch rewrites', () => {
  const SPEC = 'params:\n  region: APAC\n  quarter: Q3\n';

  it('counts a line rewritten in place as one', () => {
    const done = applyPatch(
      SPEC,
      { ops: [{ op: 'set', path: ['params', 'region'], value: 'EMEA' }] },
      { file: FILE },
    );
    expect(rewrites(SPEC, done.edits)).toBe(1);
  });

  it('counts each line a patch adds', () => {
    const done = applyPatch(
      SPEC,
      { ops: [{ op: 'add', path: ['params'], key: 'month', value: '07', before: null }] },
      { file: FILE },
    );
    expect(rewrites(SPEC, done.edits)).toBe(1);
  });

  it('counts the lines a block puts in, not the one place it puts them', () => {
    const done = applyPatch(
      SPEC,
      { ops: [{ op: 'addSource', path: ['params'], key: 'sizes', source: 'a: 1\nb: 2\nc: 3' }] },
      { file: FILE },
    );
    expect(rewrites(SPEC, done.edits)).toBe(4);
  });

  it('counts nothing for a patch that does nothing', () => {
    expect(rewrites(SPEC, [])).toBe(0);
  });
});
