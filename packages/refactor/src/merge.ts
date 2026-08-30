import type { Op } from '@yxl-vscode/cst';
import { pathOf } from '@yxl-vscode/loader';
import { written } from '@yxl-vscode/normalize';
import type { Patch } from '@yxl-vscode/patch';
import { KEY, type Sheet } from '@yxl-vscode/spec';
import type { StyleName } from '@yxl-vscode/units';
import type { Merging, Named, Proposing } from './proposal';
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
    const look = written({ kind: 'inline', gives: one.gives });
    alike.set(look, [...(alike.get(look) ?? []), one.name]);
  }

  const declared = declarations(spec);

  return [...alike.values()]
    .filter((names) => names.length >= WORTH_MERGING)
    .map((names) => ({ names, defs: declared.filter((one) => names.includes(one.name)) }))
    .filter(({ names, defs }) => defs.length === names.length)
    .map(({ names, defs }, index) => ({
      kind: 'merge' as const,
      id: `merge.${index}`,
      what: say('refactor.merge-definitions', { many: names.length }),
      file: spec.doc.file,
      names,
      at: readers(spec, names),
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

/** Every cell that reads one of these names, as the `style:` key to rewrite. */
function readers(spec: Proposing, names: readonly StyleName[]): readonly Named[] {
  const root = spec.doc.file;

  return spec.doc.sheets.flatMap((sheet: Sheet) =>
    sheet.cells.flatMap((cell) => {
      const use = cell.style;
      if (use === null || use.kind !== 'ref' || typeof use.name !== 'string') return [];
      if (!names.includes(use.name)) return [];

      const where = pathOf(cell.id);
      if (where === null || where.file !== root) return [];

      return [{ file: where.file, path: [...where.path, KEY.style], name: use.name }];
    }),
  );
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
