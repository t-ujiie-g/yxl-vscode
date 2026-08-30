import type { StyleLayer, StyleSource } from '@yxl-vscode/compile';
import { entryOf, holds, nodeAt, type Op, type Parsed } from '@yxl-vscode/cst';
import { pathOf } from '@yxl-vscode/loader';
import type { Patch } from '@yxl-vscode/patch';
import { INCLUDE_KEY, KEY, type StyleSays } from '@yxl-vscode/spec';
import type { FilePath, StyleName } from '@yxl-vscode/units';
import { type Gathering, type Holds, lookOf, type Proposing, type Site } from './proposal';
import { say } from './text';

/** The trees a proposal reads, which is every file the spec is written in. */
type Trees = (file: FilePath) => Parsed | null;

/** How many places must write the same look before gathering it is worth a definition. */
export const WORTH_EXTRACTING = 3;

/** Where a look may be written out in full: a cell's own key, or an exception's (`docs/spec.md` §23). */
const WRITTEN_AT: readonly StyleSource[] = ['cell', 'override'];

/** One look and every place that writes it out in full. */
interface Group {
  readonly gives: StyleSays;
  readonly at: Site[];
}

/**
 * Looks written where they are used — on cells and on the exceptions that
 * accumulate beside them — at enough places to be worth a name
 * (`ROADMAP.md` Phase 21). A look another file writes is left alone.
 */
export function gatherStyles(spec: Proposing): readonly Gathering[] {
  const root = spec.doc.file;
  const home = homeOf(root, spec.parsed);
  if (home === null) return [];

  const taken = spec.grid.styles.map((one) => one.name);
  const found = new Map<string, Group>();

  for (const sheet of spec.grid.sheets) {
    for (const cell of sheet.cells.values()) {
      for (const layer of cell.style) {
        const site = siteOf(layer, root, spec.parsed);
        if (site === null) continue;

        const source = lookOf(layer.gives);
        const group = found.get(source) ?? { gives: layer.gives, at: [] };
        group.at.push(site);
        found.set(source, group);
      }
    }
  }

  return [...found]
    .filter(([, group]) => group.at.length >= WORTH_EXTRACTING)
    .map(([source, group], index) => ({
      kind: 'gather' as const,
      id: `gather.${index}`,
      what: say('refactor.gather-a-style', { sites: group.at.length }),
      file: root,
      at: group.at,
      source,
      suggested: suggestedName(group.gives),
      taken,
      holds: home,
    }));
}

/** The `style:` key a layer is written at, or `null` where it is not one this can gather. */
function siteOf(layer: StyleLayer, root: FilePath, trees: Trees): Site | null {
  if (layer.name !== null || layer.key !== KEY.style) return null;
  if (!WRITTEN_AT.includes(layer.through)) return null;

  const where = pathOf(layer.node);
  if (where === null || where.file !== root) return null;

  const tree = trees(where.file);
  const node = tree?.root == null ? null : nodeAt(tree.root, where.path);
  if (node === null) return null;

  const value = entryOf(node, KEY.style)?.value ?? null;
  if (value === null || holds(value, INCLUDE_KEY)) return null;

  return { file: where.file, path: [...where.path, KEY.style] };
}

/** Which of `defs:` and `defs.styles:` the root already writes, or `null` where one is another file's. */
function homeOf(root: FilePath, trees: Trees): Holds | null {
  const tree = trees(root);
  if (tree === null || tree.root === null) return null;

  const defs = entryOf(tree.root, KEY.defs)?.value ?? null;
  if (defs === null) return 'nothing';
  if (holds(defs, INCLUDE_KEY)) return null;

  const styles = entryOf(defs, KEY.styles)?.value ?? null;
  if (styles === null) return 'defs';

  return holds(styles, INCLUDE_KEY) ? null : 'styles';
}

/**
 * The ops that gather a look under one name: the definition where the spec
 * keeps its own, and every site that wrote the look reading it instead.
 */
export function gatherPatch(one: Gathering, name: StyleName): Patch {
  // `write` rather than `set`: a look written out in full is a mapping, and only
  // putting text over it can be taken back byte for byte (ADR-026).
  const sites: Op[] = one.at.map((at) => ({ op: 'write', path: at.path, source: name }));

  return { ops: [declaring(one, name), ...sites] };
}

/** The definition itself, under whichever of the two keys the root already has. */
function declaring(one: Gathering, name: StyleName): Op {
  const entry = `${name}: ${one.source}`;

  if (one.holds === 'styles') {
    return { op: 'addSource', path: [KEY.defs, KEY.styles], key: name, source: one.source };
  }
  if (one.holds === 'defs') {
    return { op: 'addSource', path: [KEY.defs], key: KEY.styles, source: entry };
  }

  return { op: 'addSource', path: [], key: KEY.defs, source: `${KEY.styles}:\n  ${entry}` };
}

/** A name for a look, from what it says: `bold-blue` reads better than `style1`. */
export function suggestedName(gives: StyleSays): string {
  const fill = gives.fill;
  const words = [
    gives['font.bold'] === true ? 'bold' : '',
    gives['font.italic'] === true ? 'italic' : '',
    typeof fill === 'string' ? fill.replace('#', '') : '',
  ].filter((one) => one !== '');

  return words.length === 0 ? 'style' : words.join('-').toLowerCase();
}
