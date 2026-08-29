import { KEY } from '@yxl-vscode/spec';
import { type A1Addr, cellOf, type SheetName } from '@yxl-vscode/units';
import { type Intent, keyed, type Reading, refused, writtenSheet } from './direct';
import { say } from './text';
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
  const found = writtenSheet(spec, frozen.sheet, read);
  if (found.kind === 'refused') return found;

  const at = frozen.at;
  if (at !== null && cellOf(at).row === 1 && cellOf(at).col === 1) {
    return refused(say('intent.a1-freezes-nothing'));
  }

  if (found.sheet.split !== null) {
    return refused(say('intent.split-and-freeze', { sheet: frozen.sheet }));
  }

  const ops = keyed(found.path, KEY.freeze, at, found.node);
  if (ops.length === 0) return refused(say('intent.nothing-frozen', { sheet: frozen.sheet }));

  return {
    kind: 'edit',
    file: found.file,
    patch: { ops },
    expects: { cells: new Set(), beyond: 'refuse' },
  };
}
