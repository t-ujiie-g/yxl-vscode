import { sheetOf } from '@yxl-vscode/compile';
import { KEY } from '@yxl-vscode/spec';
import { type A1Addr, cellOf, type SheetName } from '@yxl-vscode/units';
import { type Intent, keyed, located, type Reading, refused } from './direct';
import type { Projection } from './writes';

/** A sheet's panes as a gesture asks for them: the cell to freeze at, or `null` to take the freeze off. */
export interface Frozen {
  readonly sheet: SheetName;
  readonly at: A1Addr | null;
}

/**
 * Freezing a sheet's panes: the sheet's own `freeze:` key and nowhere else
 * (`docs/spec.md` §2), or `null` to take it off. A sheet written with a
 * `split:` is refused rather than rewritten (ADR-040).
 */
export function setFreeze(spec: Projection, frozen: Frozen, read: Reading): Intent {
  const sheet = sheetOf(spec.grid, frozen.sheet);
  if (sheet === null) return refused(`there is no sheet named \`${frozen.sheet}\``);

  const at = frozen.at;
  if (at !== null && cellOf(at).row === 1 && cellOf(at).col === 1) {
    return refused('`A1` freezes nothing — freeze at the first cell that is to scroll');
  }

  if (sheet.split !== null) {
    return refused(
      `\`${frozen.sheet}\` is split, and a sheet cannot have both a \`split\` and a \`freeze\``,
    );
  }

  const found = located(sheet.node, read);
  if (found.kind === 'refused') return found;
  if (found.node.kind !== 'map') return refused(`\`${frozen.sheet}\` is not written as a sheet`);

  const ops = keyed(found.path, KEY.freeze, at, found.node);
  if (ops.length === 0) return refused(`\`${frozen.sheet}\` freezes nothing to take off`);

  return {
    kind: 'edit',
    file: found.file,
    patch: { ops },
    expects: { cells: new Set(), beyond: 'refuse' },
  };
}
