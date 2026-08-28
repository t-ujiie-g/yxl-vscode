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

    it('refuses one with no body, which has no indent to write the value at', () => {
      const { diagnostics, text } = edit('body: |\n', { op: 'set', path: ['body'], value: 'one' });

      expect(diagnostics[0]?.code).toBe(CODE.emptyBlockScalar);
      expect(text).toBe('body: |\n');
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
