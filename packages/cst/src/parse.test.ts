import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import type { Mapping, Node, Scalar, Sequence } from './node';
import { parse } from './parse';

function read(source: string) {
  return parse(source, { file: 'test.yxl.yaml' });
}

function root(source: string): Node {
  const { root, diagnostics } = read(source);
  expect(diagnostics).toEqual([]);
  if (!root) throw new Error('expected a document');
  return root;
}

function asMap(node: Node): Mapping {
  if (node.kind !== 'map') throw new Error(`expected a mapping, found ${node.kind}`);
  return node;
}

function asSeq(node: Node): Sequence {
  if (node.kind !== 'seq') throw new Error(`expected a sequence, found ${node.kind}`);
  return node;
}

function asScalar(node: Node): Scalar {
  if (node.kind !== 'scalar') throw new Error(`expected a scalar, found ${node.kind}`);
  return node;
}

/** The text a span points at, which is the claim every span test really makes. */
function sliced(source: string, node: { span: { start: number; end: number } }): string {
  return source.slice(node.span.start, node.span.end);
}

describe('parse', () => {
  it('reads an empty document as no root', () => {
    expect(read('').root).toBeNull();
  });

  it('reads a comment-only document as no root', () => {
    expect(read('# nothing here\n').root).toBeNull();
  });

  it('reads a mapping', () => {
    const map = asMap(root('region: APAC\nquarter: Q3\n'));
    expect(map.entries.map((e) => e.key.value)).toEqual(['region', 'quarter']);
    expect(map.entries.map((e) => asScalar(e.value).value)).toEqual(['APAC', 'Q3']);
  });

  it('reads a sequence', () => {
    const seq = asSeq(root('- A\n- B\n'));
    expect(seq.items.map((i) => asScalar(i).value)).toEqual(['A', 'B']);
  });

  it('reads nesting', () => {
    const sheets = asSeq(asMap(root('sheets:\n  - name: Sales\n')).entries[0]?.value as Node);
    const sheet = asMap(sheets.items[0] as Node);
    expect(asScalar(sheet.entries[0]?.value as Node).value).toBe('Sales');
  });

  it('reads a flow mapping and a flow sequence', () => {
    const map = asMap(root('style: { bold: true }\nat: [A1, B2]\n'));
    expect(asMap(map.entries[0]?.value as Node).entries[0]?.key.value).toBe('bold');
    expect(asSeq(map.entries[1]?.value as Node).items).toHaveLength(2);
  });

  it('reads a key with no value as null', () => {
    const map = asMap(root('sheets:\n'));
    expect(asScalar(map.entries[0]?.value as Node).value).toBeNull();
  });

  describe('scalar styles', () => {
    it('keeps a quoted number as text and a plain one as a number', () => {
      const map = asMap(root('code: "007"\ncount: 7\n'));
      const code = asScalar(map.entries[0]?.value as Node);
      const count = asScalar(map.entries[1]?.value as Node);

      expect(code.value).toBe('007');
      expect(code.style).toBe('double');
      expect(count.value).toBe(7);
      expect(count.style).toBe('plain');
    });

    it('records a single-quoted style', () => {
      expect(asScalar(asMap(root("a: 'x'\n")).entries[0]?.value as Node).style).toBe('single');
    });

    it('distinguishes a literal block from a folded one', () => {
      const map = asMap(root('kept: |\n  one\n  two\nfolded: >\n  one\n  two\n'));
      expect(asScalar(map.entries[0]?.value as Node).style).toBe('literal');
      expect(asScalar(map.entries[1]?.value as Node).style).toBe('folded');
    });

    it('keeps the source text alongside the resolved value', () => {
      const map = asMap(root('n: 1.50\n'));
      const scalar = asScalar(map.entries[0]?.value as Node);
      expect(scalar.value).toBe(1.5);
      expect(scalar.source).toBe('1.50');
    });

    it('keeps the bytes of a quoted scalar, not the reading of them', () => {
      // `"a\tb"` written with a real tab and written with an escape are one
      // value and two files, and only the bytes can put one back where it was.
      const map = asMap(root('a: "x\ty"\nb: "x\\ty"\n'));

      expect(asScalar(map.entries[0]?.value as Node).source).toBe('"x\ty"');
      expect(asScalar(map.entries[1]?.value as Node).source).toBe('"x\\ty"');
      expect(asScalar(map.entries[0]?.value as Node).value).toBe(
        asScalar(map.entries[1]?.value as Node).value,
      );
    });
  });

  describe('spans', () => {
    it('points a scalar at exactly its own text', () => {
      const source = 'region: APAC\n';
      const value = asScalar(asMap(root(source)).entries[0]?.value as Node);
      expect(sliced(source, value)).toBe('APAC');
    });

    it('points a key at exactly the key', () => {
      const source = 'region: APAC\n';
      const entry = asMap(root(source)).entries[0];
      expect(sliced(source, entry?.key as Scalar)).toBe('region');
    });

    it('includes both quotes in a quoted scalar span', () => {
      const source = 'code: "007"\n';
      const value = asScalar(asMap(root(source)).entries[0]?.value as Node);
      expect(sliced(source, value)).toBe('"007"');
    });

    it('covers an entry from its key to the end of its value', () => {
      const source = 'region: APAC\nquarter: Q3\n';
      const entry = asMap(root(source)).entries[0];
      expect(sliced(source, entry as { span: { start: number; end: number } })).toBe(
        'region: APAC',
      );
    });

    it('stops a mapping at its last member, not at the trailing comment', () => {
      const source = 'region: APAC\n\n# a note that follows\n';
      expect(sliced(source, root(source))).toBe('region: APAC');
    });

    it('covers a nested collection from its first line to its last member', () => {
      const source = 'sheets:\n  - name: Sales\n  - name: Costs\n';
      const sheets = asMap(root(source)).entries[0]?.value as Node;
      expect(sliced(source, sheets)).toBe('- name: Sales\n  - name: Costs');
    });
  });

  describe('what it refuses', () => {
    it("rejects an alias, pointing at yxl's own reuse mechanism", () => {
      const { diagnostics } = read('base: &b { bold: true }\nuse: *b\n');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.code).toBe(CODE.alias);
      expect(diagnostics[0]?.message).toContain('defs:');
    });

    it('rejects a key that is a collection rather than a scalar', () => {
      const { diagnostics } = read('? [a, b]\n: value\n');
      expect(diagnostics[0]?.code).toBe(CODE.unexpectedToken);
    });

    it('rejects a non-text mapping key', () => {
      const { diagnostics } = read('1: one\n');
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.code).toBe(CODE.nonStringKey);
    });

    it('keeps the entries it did understand when one is rejected', () => {
      const { root } = read('1: one\nregion: APAC\n');
      expect(asMap(root as Node).entries.map((e) => e.key.value)).toEqual(['region']);
    });

    it('reports a second document rather than silently reading the first', () => {
      const { diagnostics, root } = read('a: 1\n---\nb: 2\n');
      expect(diagnostics[0]?.code).toBe(CODE.multipleDocuments);
      expect(asMap(root as Node).entries[0]?.key.value).toBe('a');
    });

    it('places every diagnostic in the file it was given', () => {
      const { diagnostics } = read('use: *missing\n');
      expect(diagnostics[0]?.file).toBe('test.yxl.yaml');
    });
  });
});
