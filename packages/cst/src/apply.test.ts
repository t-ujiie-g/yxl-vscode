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
