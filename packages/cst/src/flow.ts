import type { Site } from './locate';
import type { Mapping } from './node';
import { renderScalar } from './write';

type Held = Extract<Site, { in: 'map' } | { in: 'seq' }>;

/**
 * A flow mapping with an entry written into it, above the entry `before` names
 * or last without one. Everything but the entry and its separator is the file's
 * own bytes.
 */
export function withEntry(
  source: string,
  target: Mapping,
  key: string,
  value: string,
  before: string | null,
): string {
  const whole = target.span;
  const written = `${renderScalar(key)}: ${value}`;

  const above = target.entries.find((entry) => entry.key.value === before);
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
 * A flow collection with one entry cut out: the entry and one separator — the
 * comma after it, or the comma before for the last — and the file's own bytes
 * either side.
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

  return source[whole.start] === '[' ? '[]' : '{}';
}
