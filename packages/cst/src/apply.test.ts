import { describe, expect, it } from 'vitest';
import { apply } from './apply';
import { CODE } from './codes';
import type { Op } from './op';

function edit(source: string, ...ops: Op[]) {
  return apply(source, ops, { file: 'test.yxl.yaml' });
}

function text(source: string, ...ops: Op[]): string {
  const applied = edit(source, ...ops);
  expect(applied.diagnostics).toEqual([]);
  return applied.text;
}

const SPEC = `# A quarterly report
params:
  region: APAC      # overridden per build
  quarter: Q3

defs:
  styles:
    header: { bold: true }

sheets:
  - name: Sales
    cells:
      A1: Revenue
      B1: 2400000
`;

describe('apply', () => {
  it('changes nothing when there are no ops', () => {
    expect(text(SPEC)).toBe(SPEC);
  });

  describe('set', () => {
    it('replaces a scalar', () => {
      const after = text(SPEC, { op: 'set', path: ['params', 'region'], value: 'EMEA' });
      expect(after).toContain('region: EMEA');
    });

    it('leaves every other byte of the file alone', () => {
      const after = text(SPEC, { op: 'set', path: ['params', 'region'], value: 'EMEA' });
      expect(after.replace('EMEA', 'APAC')).toBe(SPEC);
    });

    it('keeps the comment that trails the line it edited', () => {
      const after = text(SPEC, { op: 'set', path: ['params', 'region'], value: 'EMEA' });
      expect(after).toContain('region: EMEA      # overridden per build');
    });

    it('reaches through a sequence', () => {
      const after = text(SPEC, { op: 'set', path: ['sheets', 0, 'name'], value: 'Costs' });
      expect(after).toContain('- name: Costs');
    });

    it('reaches inside a flow mapping', () => {
      const after = text(SPEC, {
        op: 'set',
        path: ['defs', 'styles', 'header', 'bold'],
        value: false,
      });
      expect(after).toContain('header: { bold: false }');
    });

    it('writes a number as a number', () => {
      const after = text(SPEC, { op: 'set', path: ['sheets', 0, 'cells', 'B1'], value: 1750000 });
      expect(after).toContain('B1: 1750000');
    });

    it('quotes text that would otherwise read back as a number', () => {
      const after = text(SPEC, { op: 'set', path: ['sheets', 0, 'cells', 'A1'], value: '007' });
      expect(after).toContain('A1: "007"');
    });

    it('keeps a value plain when it is safe to', () => {
      const after = text(SPEC, { op: 'set', path: ['sheets', 0, 'cells', 'A1'], value: 'Costs' });
      expect(after).toContain('A1: Costs');
    });

    it('keeps the quoting style the node already had', () => {
      const after = text('a: "one"\n', { op: 'set', path: ['a'], value: 'two' });
      expect(after).toBe('a: "two"\n');
    });

    it('writes a value onto a key that had none', () => {
      expect(text('region:\n', { op: 'set', path: ['region'], value: 'APAC' })).toBe(
        'region: APAC\n',
      );
    });

    it('applies several ops in one pass', () => {
      const after = text(
        SPEC,
        { op: 'set', path: ['params', 'region'], value: 'EMEA' },
        { op: 'set', path: ['params', 'quarter'], value: 'Q4' },
      );
      expect(after).toContain('region: EMEA');
      expect(after).toContain('quarter: Q4');
    });

    it('reports the edited ranges', () => {
      const applied = edit(SPEC, { op: 'set', path: ['params', 'quarter'], value: 'Q4' });
      expect(applied.edits).toHaveLength(1);
      expect(SPEC.slice(applied.edits[0]?.span.start, applied.edits[0]?.span.end)).toBe('Q3');
    });
  });

  describe('renameKey', () => {
    it('renames a mapping key and leaves its value alone', () => {
      const after = text(SPEC, { op: 'renameKey', path: ['sheets', 0, 'cells', 'A1'], to: 'A2' });
      expect(after).toContain('A2: Revenue');
      expect(after).not.toContain('A1:');
    });

    it('refuses to rename something that is not a mapping entry', () => {
      const { diagnostics } = edit(SPEC, { op: 'renameKey', path: [], to: 'x' });
      expect(diagnostics[0]?.code).toBe(CODE.notAKey);
    });
  });

  describe('remove', () => {
    it('takes the whole line, leaving no blank gap', () => {
      const after = text(SPEC, { op: 'remove', path: ['params', 'quarter'] });
      expect(after).not.toContain('quarter:');
      expect(after).toContain('  region: APAC      # overridden per build\n\ndefs:');
    });

    it('removes a sequence item with its dash and indentation', () => {
      const source = 'sheets:\n  - Sales\n  - Costs\n';
      expect(text(source, { op: 'remove', path: ['sheets', 0] })).toBe('sheets:\n  - Costs\n');
    });

    it('removes a nested block whole', () => {
      const after = text(SPEC, { op: 'remove', path: ['sheets', 0, 'cells'] });
      expect(after).not.toContain('A1: Revenue');
      expect(after).not.toContain('B1: 2400000');
      expect(after).toContain('- name: Sales');
    });

    it('refuses to remove the document root', () => {
      const { diagnostics } = edit(SPEC, { op: 'remove', path: [] });
      expect(diagnostics[0]?.code).toBe(CODE.cannotRemoveRoot);
    });

    it('refuses inside a flow collection rather than corrupting it', () => {
      const { diagnostics, text } = edit(SPEC, {
        op: 'remove',
        path: ['defs', 'styles', 'header', 'bold'],
      });
      expect(diagnostics[0]?.code).toBe(CODE.flowNotSupported);
      expect(text).toBe(SPEC);
    });

    it('refuses the entry that carries the dash, which would take the item apart', () => {
      const source = 'sheets:\n  - name: Sales\n    cells:\n      A1: 1\n';
      const { diagnostics, text } = edit(source, { op: 'remove', path: ['sheets', 0, 'name'] });

      expect(diagnostics[0]?.code).toBe(CODE.itemMarker);
      expect(text).toBe(source);
    });

    it('stops at the end of a block scalar rather than taking the key after it', () => {
      const source = 'notes:\n  first: |\n    one\n    two\n  second: 2\n';
      expect(text(source, { op: 'remove', path: ['notes', 'first'] })).toBe(
        'notes:\n  second: 2\n',
      );
    });

    it('takes the comment block that introduces the entry with it', () => {
      const source = 'cells:\n  A1: 1\n  # the total\n  # of the two above\n  B1: 2\n  C1: 3\n';
      expect(text(source, { op: 'remove', path: ['cells', 'B1'] })).toBe(
        'cells:\n  A1: 1\n  C1: 3\n',
      );
    });

    it('leaves a comment a blank line detached from the entry', () => {
      const source = 'cells:\n  # about this sheet\n\n  A1: 1\n  B1: 2\n';
      expect(text(source, { op: 'remove', path: ['cells', 'A1'] })).toBe(
        'cells:\n  # about this sheet\n\n  B1: 2\n',
      );
    });

    it('takes the blank line under the entry, leaving one gap and not two', () => {
      const source = 'cells:\n  A1: 1\n\n  B1: 2\n\n  C1: 3\n';
      expect(text(source, { op: 'remove', path: ['cells', 'B1'] })).toBe(
        'cells:\n  A1: 1\n\n  C1: 3\n',
      );
    });

    it('leaves the blank line under the last entry, which is not the entry’s', () => {
      const source = 'cells:\n  A1: 1\n  B1: 2\n\nother: 1\n';
      expect(text(source, { op: 'remove', path: ['cells', 'B1'] })).toBe(
        'cells:\n  A1: 1\n\nother: 1\n',
      );
    });
  });

  describe('restore', () => {
    const cells = 'cells:\n  A1: 1\n  C1: 3\n';

    it('puts lines back above the entry that followed them', () => {
      const put: Op = {
        op: 'restore',
        path: ['cells'],
        key: 'B1',
        before: 'C1',
        source: '  B1: 2\n',
      };
      expect(text(cells, put)).toBe('cells:\n  A1: 1\n  B1: 2\n  C1: 3\n');
    });

    it('puts them back last when nothing followed them', () => {
      const put: Op = {
        op: 'restore',
        path: ['cells'],
        key: 'D1',
        before: null,
        source: '  D1: 4\n',
      };
      expect(text(cells, put)).toBe('cells:\n  A1: 1\n  C1: 3\n  D1: 4\n');
    });

    it('writes the lines exactly as they are, indentation and all', () => {
      const put: Op = {
        op: 'restore',
        path: ['cells'],
        key: 'B1',
        before: 'C1',
        source: '  B1:\n    value: 2\n    style: header\n',
      };
      expect(text(cells, put)).toBe(
        'cells:\n  A1: 1\n  B1:\n    value: 2\n    style: header\n  C1: 3\n',
      );
    });

    it('goes above the comment block belonging to the entry it precedes', () => {
      const source = 'cells:\n  A1: 1\n  # the total\n  C1: 3\n';
      const put: Op = {
        op: 'restore',
        path: ['cells'],
        key: 'B1',
        before: 'C1',
        source: '  B1: 2\n',
      };
      expect(text(source, put)).toBe('cells:\n  A1: 1\n  B1: 2\n  # the total\n  C1: 3\n');
    });

    it('puts a sequence item back at the index it was taken from', () => {
      const source = 'sheets:\n  - Sales\n  - Summary\n';
      const put: Op = {
        op: 'restore',
        path: ['sheets'],
        key: 1,
        before: null,
        source: '  - Costs\n',
      };
      expect(text(source, put)).toBe('sheets:\n  - Sales\n  - Costs\n  - Summary\n');
    });

    it('refuses a key that is already there rather than writing it twice', () => {
      const put: Op = {
        op: 'restore',
        path: ['cells'],
        key: 'A1',
        before: 'C1',
        source: '  A1: 9\n',
      };
      expect(edit(cells, put).diagnostics[0]?.code).toBe(CODE.keyExists);
    });

    it('refuses when the entry it goes before is no longer there', () => {
      const put: Op = {
        op: 'restore',
        path: ['cells'],
        key: 'B1',
        before: 'Z9',
        source: '  B1: 2\n',
      };
      expect(edit(cells, put).diagnostics[0]?.code).toBe(CODE.noSuchKey);
    });

    it('refuses inside a flow collection', () => {
      const put: Op = {
        op: 'restore',
        path: ['defs', 'styles', 'header'],
        key: 'italic',
        before: null,
        source: '  italic: true\n',
      };
      expect(edit(SPEC, put).diagnostics[0]?.code).toBe(CODE.flowNotSupported);
    });
  });

  describe('insert', () => {
    it('appends an item, copying the layout of the one before it', () => {
      const source = 'sheets:\n  - Sales\n  - Costs\n';
      expect(text(source, { op: 'insert', path: ['sheets'], index: 2, value: 'Summary' })).toBe(
        'sheets:\n  - Sales\n  - Costs\n  - Summary\n',
      );
    });

    it('inserts before an existing item', () => {
      const source = 'sheets:\n  - Sales\n  - Costs\n';
      expect(text(source, { op: 'insert', path: ['sheets'], index: 0, value: 'Summary' })).toBe(
        'sheets:\n  - Summary\n  - Sales\n  - Costs\n',
      );
    });

    it('quotes an inserted value that needs it', () => {
      const source = 'codes:\n  - AAA\n';
      expect(text(source, { op: 'insert', path: ['codes'], index: 1, value: '007' })).toBe(
        'codes:\n  - AAA\n  - "007"\n',
      );
    });

    it('refuses a sequence with no item to copy a layout from', () => {
      const { diagnostics } = edit('sheets: []\n', {
        op: 'insert',
        path: ['sheets'],
        index: 0,
        value: 'Sales',
      });
      expect(diagnostics[0]?.code).toBe(CODE.flowNotSupported);
    });

    it('refuses to insert into something that is not a sequence', () => {
      const { diagnostics } = edit(SPEC, {
        op: 'insert',
        path: ['params'],
        index: 0,
        value: 'x',
      });
      expect(diagnostics[0]?.code).toBe(CODE.notASequence);
    });
  });

  describe('write', () => {
    it('puts back the exact text, escapes and all', () => {
      const source = 'values:\n  tabbed: "a\tb"\n';
      const flattened = text(source, { op: 'set', path: ['values', 'tabbed'], value: 'x' });

      expect(text(flattened, { op: 'write', path: ['values', 'tabbed'], source: '"a\tb"' })).toBe(
        source,
      );
    });

    it('writes into a key that had no value at all', () => {
      expect(text('a:\n', { op: 'write', path: ['a'], source: '1' })).toBe('a: 1\n');
    });
  });

  describe('block scalars', () => {
    const SOURCE = 'notes:\n  body: |\n    line one\n    line two\n';

    it('writes the body and keeps the block, rather than swallowing the lines under it', () => {
      expect(text(SOURCE, { op: 'set', path: ['notes', 'body'], value: 'one line' })).toBe(
        'notes:\n  body: |\n    one line\n',
      );
    });

    it('indents a value of several lines to where the body already sits', () => {
      const after = text(SOURCE, { op: 'set', path: ['notes', 'body'], value: 'one\ntwo' });
      expect(after).toBe('notes:\n  body: |\n    one\n    two\n');
    });

    it('keeps the indicator and the chomping, which sit outside the body', () => {
      const folded = 'sheets:\n  - formula: >-\n      IF(A4="", "",\n      SUM(B4:B13))\n';
      const after = text(folded, {
        op: 'set',
        path: ['sheets', 0, 'formula'],
        value: 'SUM(B4:B13)*2',
      });

      expect(after).toBe('sheets:\n  - formula: >-\n      SUM(B4:B13)*2\n');
    });

    it('writes the text, not a rendering of it: quotes here would be in the string', () => {
      const after = text(SOURCE, { op: 'set', path: ['notes', 'body'], value: 'a: b #not a key' });
      expect(after).toBe('notes:\n  body: |\n    a: b #not a key\n');
    });

    it('refuses to empty one for the same reason', () => {
      const { diagnostics } = edit(SOURCE, { op: 'clear', path: ['notes', 'body'] });
      expect(diagnostics[0]?.code).toBe(CODE.blockScalarNotSupported);
    });
  });

  describe('clear', () => {
    it('leaves the key with no value, and no space where the value was', () => {
      expect(text('a: 1\nb: 2\n', { op: 'clear', path: ['a'] })).toBe('a:\nb: 2\n');
    });

    it('leaves a key that already has no value alone', () => {
      expect(text('a:\nb: 2\n', { op: 'clear', path: ['a'] })).toBe('a:\nb: 2\n');
    });
  });

  describe('add', () => {
    it('appends an entry, copying the layout of the ones there', () => {
      const source = 'cells:\n  A1: Revenue\n  B1: 2400000\n';
      const after = text(source, {
        op: 'add',
        path: ['cells'],
        key: 'C1',
        value: 'Share',
        before: null,
      });

      expect(after).toBe('cells:\n  A1: Revenue\n  B1: 2400000\n  C1: Share\n');
    });

    it('puts an entry above the one it names, which is how a removal is undone', () => {
      const source = 'cells:\n  A1: Revenue\n  C1: Share\n';
      const after = text(source, {
        op: 'add',
        path: ['cells'],
        key: 'B1',
        value: 2400000,
        before: 'C1',
      });

      expect(after).toBe('cells:\n  A1: Revenue\n  B1: 2400000\n  C1: Share\n');
    });

    it('quotes a key and a value that need it', () => {
      const after = text('cells:\n  A1: x\n', {
        op: 'add',
        path: ['cells'],
        key: 'A2',
        value: '007',
        before: null,
      });

      expect(after).toBe('cells:\n  A1: x\n  A2: "007"\n');
    });

    it('refuses a key that is already there', () => {
      const { diagnostics } = edit('cells:\n  A1: x\n', {
        op: 'add',
        path: ['cells'],
        key: 'A1',
        value: 'y',
        before: null,
      });

      expect(diagnostics[0]?.code).toBe(CODE.keyExists);
    });

    it('refuses a mapping with no entry to copy a layout from', () => {
      const { diagnostics } = edit('cells:\n', {
        op: 'add',
        path: ['cells'],
        key: 'A1',
        value: 'x',
        before: null,
      });

      expect(diagnostics[0]?.code).toBe(CODE.notAMapping);
    });

    it('refuses to add before a key that is not there', () => {
      const { diagnostics } = edit('cells:\n  A1: x\n', {
        op: 'add',
        path: ['cells'],
        key: 'A2',
        value: 'y',
        before: 'Z9',
      });

      expect(diagnostics[0]?.code).toBe(CODE.noSuchKey);
    });
  });

  describe('writing a construct rather than a value', () => {
    const OVERRIDE = 'at: Sales!A1\nvalue: 5\nreason: "audit"';

    it('adds the key and the block under it when the key is not there', () => {
      const after = text('sheets:\n  - name: Sales\n', {
        op: 'addSource',
        path: [],
        key: 'overrides',
        source: `- ${OVERRIDE.split('\n').join('\n  ')}`,
      });

      expect(after).toBe(
        'sheets:\n  - name: Sales\noverrides:\n  - at: Sales!A1\n    value: 5\n    reason: "audit"\n',
      );
    });

    it('appends an item to a sequence that is already there', () => {
      const source = 'overrides:\n  - at: Sales!A1\n    value: 1\n';
      const after = text(source, {
        op: 'insertSource',
        path: ['overrides'],
        index: 1,
        source: 'at: Sales!B2\nvalue: 5',
      });

      expect(after).toBe(
        'overrides:\n  - at: Sales!A1\n    value: 1\n  - at: Sales!B2\n    value: 5\n',
      );
    });

    it('indents the way the file does, not the way this editor would', () => {
      const source = 'sheets:\n    - name: Sales\n';
      const after = text(source, {
        op: 'addSource',
        path: [],
        key: 'overrides',
        source: '- at: Sales!A1\n  value: 5',
      });

      expect(after).toBe(
        'sheets:\n    - name: Sales\noverrides:\n    - at: Sales!A1\n      value: 5\n',
      );
    });

    it('refuses a key that is already there', () => {
      const { diagnostics } = edit('overrides: []\n', {
        op: 'addSource',
        path: [],
        key: 'overrides',
        source: '- at: Sales!A1',
      });

      expect(diagnostics[0]?.code).toBe(CODE.keyExists);
    });

    it('refuses a sequence written in flow style', () => {
      const { diagnostics } = edit('overrides: []\n', {
        op: 'insertSource',
        path: ['overrides'],
        index: 0,
        source: 'at: Sales!A1',
      });

      expect(diagnostics[0]?.code).toBe(CODE.flowNotSupported);
    });
  });

  describe('comments', () => {
    it('leaves a comment above an entry attached to that entry when inserting before it', () => {
      const source = 'sheets:\n  # the sales sheet\n  - Sales\n  - Costs\n';
      expect(text(source, { op: 'insert', path: ['sheets'], index: 0, value: 'Summary' })).toBe(
        'sheets:\n  - Summary\n  # the sales sheet\n  - Sales\n  - Costs\n',
      );
    });

    it('keeps a whole comment block with the entry it describes', () => {
      const source = 'sheets:\n  # one\n  # two\n  - Sales\n';
      expect(text(source, { op: 'insert', path: ['sheets'], index: 0, value: 'Summary' })).toBe(
        'sheets:\n  - Summary\n  # one\n  # two\n  - Sales\n',
      );
    });

    it('stops at a blank line, which detaches a comment from what follows it', () => {
      const source = 'sheets:\n  # a section heading\n\n  - Sales\n';
      expect(text(source, { op: 'insert', path: ['sheets'], index: 0, value: 'Summary' })).toBe(
        'sheets:\n  # a section heading\n\n  - Summary\n  - Sales\n',
      );
    });

    it('writes the line ending the file already uses', () => {
      const source = 'sheets:\r\n  - Sales\r\n';
      expect(text(source, { op: 'insert', path: ['sheets'], index: 1, value: 'Costs' })).toBe(
        'sheets:\r\n  - Sales\r\n  - Costs\r\n',
      );
    });

    it('takes a trailing comment with the line it removes', () => {
      const source = 'params:\n  region: APAC   # only used here\n  quarter: Q3\n';
      expect(text(source, { op: 'remove', path: ['params', 'region'] })).toBe(
        'params:\n  quarter: Q3\n',
      );
    });
  });

  describe('what it refuses', () => {
    it('reports a path that does not exist and changes nothing', () => {
      const { diagnostics, text } = edit(SPEC, { op: 'set', path: ['nope'], value: 1 });
      expect(diagnostics[0]?.code).toBe(CODE.noSuchPath);
      expect(text).toBe(SPEC);
    });

    it('names the path it could not find, the way a reader writes one', () => {
      const { diagnostics } = edit(SPEC, {
        op: 'set',
        path: ['sheets', 3, 'cells', 'A1'],
        value: 1,
      });
      expect(diagnostics[0]?.message).toContain('sheets[3].cells.A1');
    });

    it('applies the ops it understood even when one is refused', () => {
      const { text } = edit(
        SPEC,
        { op: 'set', path: ['nope'], value: 1 },
        { op: 'set', path: ['params', 'region'], value: 'EMEA' },
      );
      expect(text).toContain('region: EMEA');
    });

    it('refuses two edits that cover the same text', () => {
      const { diagnostics } = edit(
        SPEC,
        { op: 'set', path: ['params'], value: 'gone' },
        { op: 'set', path: ['params', 'region'], value: 'EMEA' },
      );
      expect(diagnostics[0]?.code).toBe(CODE.overlappingEdits);
    });
  });
});
