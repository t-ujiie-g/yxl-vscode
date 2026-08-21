import type { Entry, Mapping, Node, Sequence } from './node';
import type { Path } from './op';

/** A node together with what holds it, which renaming and removing need. */
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

/** The node a path reaches, or `null` where it reaches nothing. */
export function nodeAt(root: Node, path: Path): Node | null {
  return locate(root, path)?.node ?? null;
}

/** A path as one comparable string, so two of them can be asked whether they name the same place. */
export function marked(path: Path): string {
  return JSON.stringify(path);
}

/** `sheets[0].name` — how a path reads in a diagnostic. */
export function formatPath(path: Path): string {
  return path.reduce<string>((text, step) => {
    if (typeof step === 'number') return `${text}[${step}]`;
    return text === '' ? step : `${text}.${step}`;
  }, '');
}

/** The entry a mapping keys under this name, or nothing — from a node that may not be a mapping. */
export function entryOf(node: Node, key: string): Entry | undefined {
  return node.kind === 'map' ? node.entries.find((entry) => entry.key.value === key) : undefined;
}

/** Whether the mapping writes that key at all, which is not the same as what it holds there. */
export function holds(node: Node, key: string): boolean {
  return entryOf(node, key) !== undefined;
}
