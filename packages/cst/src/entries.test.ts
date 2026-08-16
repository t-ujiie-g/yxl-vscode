import { describe, expect, it } from 'vitest';
import { apply } from './apply';
import { CODE } from './codes';
import { removalOf } from './entries';
import type { Op } from './op';
import { parse } from './parse';

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

describe('entries of a collection', () => {
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

    it('writes an entry into a flow mapping, above the one it names', () => {
      const source = 'cells:\n  B4: { format: "0.0%" }\n';
      const op: Op = {
        op: 'add',
        path: ['cells', 'B4'],
        key: 'value',
        value: 0.01,
        before: 'format',
      };
      expect(text(source, op)).toBe('cells:\n  B4: { value: 0.01, format: "0.0%" }\n');
    });

    it('writes it last in a flow mapping where it names nothing', () => {
      const source = 'cells:\n  B4: { format: "0.0%" }\n';
      const op: Op = { op: 'add', path: ['cells', 'B4'], key: 'value', value: 0.01, before: null };
      expect(text(source, op)).toBe('cells:\n  B4: { format: "0.0%", value: 0.01 }\n');
    });

    it('cuts an entry out of a flow collection, separator and all', () => {
      const source = 'cells:\n  B4: { value: 0.085, format: "0.0%" }\n';
      expect(text(source, { op: 'remove', path: ['cells', 'B4', 'value'] })).toBe(
        'cells:\n  B4: { format: "0.0%" }\n',
      );
    });

    it('takes the comma before it where it is the last one in the flow', () => {
      const source = 'cells:\n  B4: { value: 0.085, format: "0.0%" }\n';
      expect(text(source, { op: 'remove', path: ['cells', 'B4', 'format'] })).toBe(
        'cells:\n  B4: { value: 0.085 }\n',
      );
    });

    it('leaves the brackets where it was the only one in them', () => {
      const source = 'cells:\n  B4: { value: 0.085 }\n';
      expect(text(source, { op: 'remove', path: ['cells', 'B4', 'value'] })).toBe(
        'cells:\n  B4: {}\n',
      );
    });

    it('cuts an item out of a flow sequence the same way', () => {
      const source = 'sheets:\n  - name: Sales\n    merges: [A1:B1, C1:D1]\n';
      expect(text(source, { op: 'remove', path: ['sheets', 0, 'merges', 0] })).toBe(
        'sheets:\n  - name: Sales\n    merges: [C1:D1]\n',
      );
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

  describe('what a removal would take', () => {
    const removing = (source: string, path: (string | number)[]) => {
      const { root } = parse(source, { file: 'test.yxl.yaml' });
      if (root === null) throw new Error('did not parse');

      const found = removalOf(source, root, path);
      return found === null
        ? null
        : { ...found, text: source.slice(found.span.start, found.span.end) };
    };

    it('names the lines, the key, and the entry they go back above', () => {
      const source = 'cells:\n  A1: 1\n  # the total\n  B1: 2\n  C1: 3\n';

      expect(removing(source, ['cells', 'B1'])).toEqual({
        of: 'entry',
        span: { start: 15, end: 37 },
        key: 'B1',
        before: 'C1',
        inexact: null,
        text: '  # the total\n  B1: 2\n',
      });
    });

    it('says a sequence item goes back at the index it was taken from', () => {
      const source = 'sheets:\n  - Sales\n  - Costs\n';
      expect(removing(source, ['sheets', 0])).toMatchObject({ key: 0, before: null });
    });

    it('gives the reason when the lines could not go back where they were', () => {
      const source = 'cells:\n  A1: 1\n\n  B1: 2\n';
      const found = removing(source, ['cells', 'B1']);
      expect(found?.of === 'entry' && found.inexact).toContain('lines above it');
    });

    it('keeps a flow collection whole, since there are no lines to put back', () => {
      const source = 'cells:\n  B4: { value: 0.085, format: "0.0%" }\n';
      const found = removing(source, ['cells', 'B4', 'value']);

      expect(found?.of === 'flow' && found.source).toBe('{ value: 0.085, format: "0.0%" }');
    });

    it('has nothing to say about the document root', () => {
      expect(removing('cells:\n  A1: 1\n', [])).toBeNull();
    });
  });
});
