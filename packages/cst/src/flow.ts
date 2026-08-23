import { type Span, span } from '@yxl-vscode/diag';
import { entryOf, type Site } from './locate';
import type { Mapping, Sequence } from './node';
import type { Edit } from './op';
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

  const above = entryOf(target, before ?? '');
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

/**
 * The text one entry of a flow collection takes with it — itself and the one
 * separator beside it — or `null` where it is the only one in the brackets and
 * what is left is the brackets themselves.
 */
export function cutOf(source: string, site: Held): Span | null {
  const whole = site.parent.span;
  const own = site.in === 'map' ? site.entry.span : site.node.span;

  const after = /^\s*,\s*/.exec(source.slice(own.end, whole.end - 1));
  if (after !== null) return span(own.start, own.end + after[0].length);

  const before = /,\s*$/.exec(source.slice(whole.start + 1, own.start));

  return before === null ? null : span(own.start - before[0].length, own.end);
}

/**
 * Where an item goes into a flow sequence, and the text it takes with it: a
 * point before the one it displaces, or after the last where it goes at the
 * end. An empty `[]` is filled between its brackets.
 */
export function itemAt(target: Sequence, index: number, written: string): Edit {
  const item = target.items[index];
  if (item !== undefined)
    return { span: span(item.span.start, item.span.start), text: `${written}, ` };

  const last = target.items[target.items.length - 1];
  if (last === undefined) {
    return { span: span(target.span.start + 1, target.span.end - 1), text: written };
  }

  return { span: span(last.span.end, last.span.end), text: `, ${written}` };
}
