import type { Op, Path } from '@yxl-vscode/cst';
import { pathOf } from '@yxl-vscode/loader';
import type { Patch } from '@yxl-vscode/patch';
import {
  type FooterEntry,
  type HeaderCell,
  KEY,
  type LayoutColumn,
  type SpecDoc,
  type StyleUse,
  type Templated,
} from '@yxl-vscode/spec';
import type { NodeId, StyleName } from '@yxl-vscode/units';
import { lookOf, type Merging, type Named, type Proposing } from './proposal';
import { say } from './text';

/** How many definitions must say the same thing before one of them is redundant. */
export const WORTH_MERGING = 2;

/**
 * Definitions that resolve to the same look (`ROADMAP.md` Phase 21). Which of
 * the names survives is the reader's to choose, so the proposal carries them all.
 */
export function mergeStyles(spec: Proposing): readonly Merging[] {
  const alike = new Map<string, StyleName[]>();
  for (const one of spec.grid.styles) {
    const look = lookOf(one.gives);
    alike.set(look, [...(alike.get(look) ?? []), one.name]);
  }

  const declared = declarations(spec);
  const naming = namings(spec.doc);
  // A `${...}` may name any of them, which no rewrite here can follow.
  if (naming.some((one) => typeof one.name !== 'string')) return [];

  return [...alike.values()]
    .filter((names) => names.length >= WORTH_MERGING)
    .map((names) => ({ names, defs: declared.filter((one) => names.includes(one.name)) }))
    .filter(({ names, defs }) => defs.length === names.length)
    .filter(({ names }) => !inherited(spec.doc, names))
    .map(({ names, defs }) => ({ names, defs, at: readers(spec, naming, names) }))
    .filter((one): one is typeof one & { at: readonly Named[] } => one.at !== null)
    .map(({ names, defs, at }, index) => ({
      kind: 'merge' as const,
      id: `merge.${index}`,
      what: say('refactor.merge-definitions', { many: names.length }),
      file: spec.doc.file,
      names,
      at,
      defs,
    }));
}

/** Where each `defs.styles` entry is written, for the ones this can take away. */
function declarations(spec: Proposing): readonly Named[] {
  const root = spec.doc.file;

  return spec.doc.defs.styles.flatMap((def) => {
    const where = pathOf(def.id);
    if (where === null || where.file !== root) return [];

    return [{ file: where.file, path: where.path, name: def.name }];
  });
}

/** One place the spec names a style: a `style:`, a `header_style:`, or an `extends:`, under the node `id`. */
interface Naming {
  readonly id: NodeId;
  readonly under: Path;
  readonly name: Templated<StyleName>;
}

/** Every place the spec names a style, wherever a look can be named (`docs/spec.md` §6, §25). */
function namings(doc: SpecDoc): Naming[] {
  const found: Naming[] = [];
  const use = (id: NodeId, key: string, style: StyleUse | null) => {
    if (style?.kind === 'ref') found.push({ id, under: [key], name: style.name });
    if (style?.kind === 'inline' && style.style.extends !== null) {
      found.push({ id, under: [key, KEY.extends], name: style.style.extends });
    }
  };
  const header = (cells: readonly (HeaderCell | null)[] | null) => {
    for (const cell of cells ?? []) if (cell !== null) use(cell.id, KEY.style, cell.style);
  };
  const column = (one: LayoutColumn) => {
    use(one.id, KEY.style, one.style);
    header(one.header);
    for (const rule of one.conditional) use(rule.id, KEY.style, rule.style);
  };
  const footer = (entries: readonly FooterEntry[]) => {
    for (const entry of entries) {
      if (entry.kind === 'group') {
        footer(entry.rows);
        continue;
      }
      use(entry.id, KEY.style, entry.style);
      for (const cell of entry.cells) use(cell.id, KEY.style, cell.style);
    }
  };

  for (const sheet of doc.sheets) {
    for (const one of [...sheet.cells, ...sheet.columns, ...sheet.rows, ...sheet.conditional]) {
      use(one.id, KEY.style, one.style);
    }
    for (const layout of sheet.layouts) {
      use(layout.id, KEY.headerStyle, layout.headerStyle);
      for (const entry of layout.columns) {
        if (entry.kind === 'column') column(entry);
        else header(entry.header);
      }
      footer(layout.footer);
    }
  }
  for (const one of doc.overrides) use(one.id, KEY.style, one.style);
  for (const block of doc.defs.blocks) for (const one of block.columns) column(one);
  for (const def of doc.defs.styles) {
    if (def.style.extends !== null)
      found.push({ id: def.id, under: [KEY.extends], name: def.style.extends });
  }

  return found;
}

/** Whether one of these definitions reaches another through `extends:`, which keeping either would break. */
function inherited(doc: SpecDoc, names: readonly StyleName[]): boolean {
  const parents = new Map(doc.defs.styles.map((def) => [def.name, def.style.extends]));

  return names.some((name) => {
    const seen = new Set<string>([name]);
    for (let at = parents.get(name); typeof at === 'string'; at = parents.get(at)) {
      if (names.includes(at)) return true;
      if (seen.has(at)) return false;
      seen.add(at);
    }
    return false;
  });
}

/** Every place that names one of these, as the scalar to rewrite; `null` where one is in a file this cannot write. */
function readers(
  spec: Proposing,
  naming: readonly Naming[],
  names: readonly StyleName[],
): readonly Named[] | null {
  const root = spec.doc.file;
  const found: Named[] = [];

  for (const one of naming) {
    if (typeof one.name !== 'string' || !names.includes(one.name)) continue;

    const where = pathOf(one.id);
    if (where === null || where.file !== root) return null;
    found.push({ file: where.file, path: [...where.path, ...one.under], name: one.name });
  }

  return found;
}

/**
 * The ops that leave one definition standing: every reader of another name
 * follows the one kept, and the definitions it replaces are taken away.
 */
export function mergePatch(one: Merging, keep: StyleName): Patch {
  const readers: Op[] = one.at
    .filter((at) => at.name !== keep)
    .map((at) => ({ op: 'write', path: at.path, source: keep }));

  const taken: Op[] = one.defs
    .filter((def) => def.name !== keep)
    .map((def) => ({ op: 'remove', path: def.path }));

  return { ops: [...readers, ...taken] };
}
