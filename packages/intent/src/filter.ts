import { KEY } from '@yxl-vscode/spec';
import { type Rect, rangeOf, type SheetName } from '@yxl-vscode/units';
import { nothingChanges } from '@yxl-vscode/verify';
import { type Intent, keyed, type Projection, type Reading, refused, writtenSheet } from './direct';
import { say } from './text';

/** A sheet's auto filter as a gesture asks for it: the header row, or `null` to take it off. */
export interface Filtering {
  readonly sheet: SheetName;
  readonly rect: Rect | null;
}

/**
 * A sheet's `filter:`, which is the header row Excel hangs its dropdowns off —
 * one per sheet, and the rectangle's top row is what it takes
 * (`docs/spec.md` §10).
 */
export function setFilter(spec: Projection, where: Filtering, read: Reading): Intent {
  const found = writtenSheet(spec, where.sheet, read);
  if (found.kind === 'refused') return found;

  const rect = where.rect;
  const header = rect === null ? null : rangeOf({ ...rect, bottom: rect.top });
  const ops = keyed(found.path, KEY.filter, header, found.node);
  if (ops.length === 0) {
    return refused(say('intent.no-filter-to-take-off', { sheet: where.sheet }));
  }

  return { kind: 'edit', file: found.file, patch: { ops }, expects: nothingChanges };
}
