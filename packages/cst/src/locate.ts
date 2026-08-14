import type { Entry, Mapping, Node, Sequence } from './node';
import type { Path } from './op';

/**
 * A node together with what holds it, which is what an edit needs: replacing a
 * value only wants the node, but renaming or removing wants the entry it sits
 * in and the collection that entry belongs to.
 */
export type Site =
  | { readonly in: 'root'; readonly node: Node }
  | {
      readonly in: 'map';
      readonly node: Node;
      readonly parent: Mapping;
      readonly entry: Entry;
      readonly index: number;
    }
  | {
      readonly in: 'seq';
      readonly node: Node;
      readonly parent: Sequence;
      readonly index: number;
    };

export function locate(root: Node, path: Path): Site | undefined {
  let site: Site = { in: 'root', node: root };

  for (const step of path) {
    const next = step_(site.node, step);
    if (!next) return undefined;
    site = next;
  }

  return site;
}

function step_(node: Node, step: string | number): Site | undefined {
  if (typeof step === 'string') {
    if (node.kind !== 'map') return undefined;
    const index = node.entries.findIndex((e) => e.key.value === step);
    const entry = node.entries[index];
    return entry ? { in: 'map', node: entry.value, parent: node, entry, index } : undefined;
  }

  if (node.kind !== 'seq') return undefined;
  const item = node.items[step];
  return item ? { in: 'seq', node: item, parent: node, index: step } : undefined;
}

/** `sheets[0].name` — how a path reads in a diagnostic. */
export function formatPath(path: Path): string {
  return path.reduce<string>((text, step) => {
    if (typeof step === 'number') return `${text}[${step}]`;
    return text === '' ? step : `${text}.${step}`;
  }, '');
}
