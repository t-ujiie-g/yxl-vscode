import { apply, type Node, type Path, parse, resolvePlain } from '@yxl-vscode/cst';
import { applyPatch } from '@yxl-vscode/patch';
import { describe, expect, it } from 'vitest';
import { CST, Parser } from 'yaml';
import { awkward, type Sample, yxlExamples } from './corpus';

const examples = yxlExamples();
const fixtures = awkward();
const corpus = [...examples, ...fixtures];

/** Every scalar in the tree, with the path that reaches it. */
function scalars(node: Node, path: Path = []): { path: Path; node: Node }[] {
  if (node.kind === 'scalar') return [{ path, node }];
  if (node.kind === 'map') {
    return node.entries.flatMap((e) => scalars(e.value, [...path, e.key.value as string]));
  }
  return node.items.flatMap((item, index) => scalars(item, [...path, index]));
}

function read(sample: Sample) {
  return parse(sample.source, { file: sample.name });
}

describe('the corpus', () => {
  it('includes yxl own examples', () => {
    // A sibling yxl checkout is how this tier gets its real specs. Passing
    // vacuously because the directory is missing would be the worst outcome,
    // so the count is asserted rather than assumed.
    expect(examples.length).toBeGreaterThan(0);
  });

  it('includes the awkward fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });
});

describe.each(corpus)('$name', (sample) => {
  it('is retained character for character by the parser library', () => {
    // ADR-003 rests on this: the CST keeps every byte, so patching it can leave
    // the untouched regions alone. If it were ever false, minimal patching
    // would be built on sand — so it is asserted over the whole corpus rather
    // than taken from the library's documentation.
    const tokens = [...new Parser().parse(sample.source)];
    expect(tokens.map((t) => CST.stringify(t)).join('')).toBe(sample.source);
  });

  it('parses without error', () => {
    expect(read(sample).diagnostics).toEqual([]);
  });

  it('gives every scalar a span that slices back to its own value', () => {
    const { root } = read(sample);
    if (!root) return;

    for (const { path, node } of scalars(root)) {
      if (node.kind !== 'scalar') continue;
      const sliced = sample.source.slice(node.span.start, node.span.end);

      // A block scalar's span covers its indented body, which is not the value
      // — the indentation is stripped when it resolves. Every other style
      // slices back to text that resolves to exactly the same value.
      if (node.style === 'literal' || node.style === 'folded') {
        expect(node.span.end, `${path.join('.')} span is inverted`).toBeGreaterThanOrEqual(
          node.span.start,
        );
        continue;
      }
      if (node.style === 'plain' && node.source !== '') {
        expect(resolvePlain(sliced), `${path.join('.')} does not slice back`).toEqual(node.value);
      }
    }
  });

  it('changes only the line it was asked to change', () => {
    const { root } = read(sample);
    if (!root) return;

    const target = scalars(root).find(
      ({ node, path }) => node.kind === 'scalar' && node.style === 'plain' && path.length > 0,
    );
    if (!target) return;

    const applied = apply(sample.source, [{ op: 'set', path: target.path, value: 'SENTINEL' }], {
      file: sample.name,
    });
    expect(applied.diagnostics).toEqual([]);

    const before = sample.source.split('\n');
    const after = applied.text.split('\n');
    expect(after).toHaveLength(before.length);

    const moved = before.flatMap((line, index) => (line === after[index] ? [] : [index]));
    expect(moved, `expected one changed line, changed ${moved.length}`).toHaveLength(1);
    expect(after[moved[0] as number]).toContain('SENTINEL');
  });

  it('comes back byte for byte when the edit is undone', () => {
    // The other half of what makes an edit safe to make: the same file, not a
    // file that parses to the same thing (ADR-010). Over a corpus written to be
    // hostile to a serializer, an undo that reformatted anything would show.
    const { root } = read(sample);
    if (!root) return;

    const target = scalars(root).find(
      ({ node, path }) => node.kind === 'scalar' && node.source !== '' && path.length > 0,
    );
    if (!target) return;

    const ops = [{ op: 'set', path: target.path, value: 'SENTINEL' } as const];
    const done = applyPatch(sample.source, { ops }, { file: sample.name });
    expect(done.diagnostics).toEqual([]);
    if (done.back === null) throw new Error('no way back');

    expect(applyPatch(done.text, done.back, { file: sample.name }).text).toBe(sample.source);
  });
});
