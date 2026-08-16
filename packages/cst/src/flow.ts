import type { Site } from './locate';
import type { Mapping } from './node';
import type { Op } from './op';
import { renderScalar } from './write';

/** A collection written between brackets, and the entry being written into it. */
type Held = Extract<Site, { in: 'map' } | { in: 'seq' }>;

/**
 * A flow mapping with an entry written into it, as text.
 *
 * `before` names the entry it goes above, as it does in the block form, and
 * without one it goes last. Everything but the entry and its separator is the
 * file's own bytes, so nothing else in the collection is reformatted.
 */
export function withEntry(source: string, target: Mapping, op: Extract<Op, { op: 'add' }>): string {
  const whole = target.span;
  const written = `${renderScalar(op.key)}: ${renderScalar(op.value)}`;

  const above = target.entries.find((entry) => entry.key.value === op.before);
  if (above !== undefined) {
    return (
      source.slice(whole.start, above.span.start) +
      written +
      ', ' +
      source.slice(above.span.start, whole.end)
    );
  }

  const last = target.entries[target.entries.length - 1];
  if (last === undefined) {
    return `${source.slice(whole.start, whole.start + 1)} ${written} ${source.slice(whole.end - 1, whole.end)}`;
  }

  return (
    source.slice(whole.start, last.span.end) +
    ', ' +
    written +
    source.slice(last.span.end, whole.end)
  );
}

/**
 * A flow collection with one of its entries cut out, as text.
 *
 * `{ value: 0.085, format: "0.0%" }` is one line, so there are no lines to take
 * — what goes is the entry and one separator, and the rest of the collection is
 * the file's own bytes on either side of the cut. Which separator depends on
 * where the entry sits: the comma after it, or, for the last one, the comma
 * before.
 */
export function withoutEntry(source: string, site: Held): string {
  const whole = site.parent.span;
  const own = site.in === 'map' ? site.entry.span : site.node.span;

  const after = /^\s*,\s*/.exec(source.slice(own.end, whole.end - 1));
  if (after !== null) {
    return (
      source.slice(whole.start, own.start) + source.slice(own.end + after[0].length, whole.end)
    );
  }

  const before = /,\s*$/.exec(source.slice(whole.start + 1, own.start));
  if (before !== null) {
    return (
      source.slice(whole.start, own.start - before[0].length) + source.slice(own.end, whole.end)
    );
  }

  // The only one in it: what is left is the collection's own brackets, and
  // whether an empty one means anything is the compiler's question, not this
  // layer's.
  return source[whole.start] === '[' ? '[]' : '{}';
}
