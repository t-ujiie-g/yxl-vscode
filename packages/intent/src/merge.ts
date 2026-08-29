import { type CompiledMerge, sheetOf } from '@yxl-vscode/compile';
import type { Op, Path } from '@yxl-vscode/cst';
import { KEY } from '@yxl-vscode/spec';
import {
  addressesOf,
  type FilePath,
  overlapping,
  qualified,
  type Rect,
  rangeOf,
  type SheetName,
} from '@yxl-vscode/units';
import {
  type Intent,
  keptElsewhere,
  located,
  type Projection,
  type Reading,
  refused,
} from './direct';
import { say } from './text';

/** A rectangle a reader asked to draw as one cell, or to take back apart (`docs/spec.md` §2). */
export interface Merging {
  readonly sheet: SheetName;
  readonly rect: Rect;
  readonly merged: boolean;
}

/**
 * A merge written or taken out — the sheet's `merges:` list, which has one place
 * to live, so this is an intent rather than a question (ADR-040).
 */
export function setMerged(spec: Projection, where: Merging, read: Reading): Intent {
  const sheet = sheetOf(spec.grid, where.sheet);
  if (sheet === null) return refused(say('intent.no-such-sheet', { sheet: where.sheet }));

  const touched = sheet.merges.filter((one) => overlapping(one.rect, where.rect));
  if (!where.merged) return apart(where, sheet.merges, touched, read);

  if (where.rect.top === where.rect.bottom && where.rect.left === where.rect.right) {
    return refused(say('intent.merge-needs-more'));
  }

  const over = touched[0];
  if (over !== undefined) {
    return refused(say('intent.already-merged', { range: rangeOf(over.rect) }));
  }

  const found = located(sheet.node, read);
  if (found.kind === 'refused') return found;

  const away = keptElsewhere(found.node, KEY.merges, where.sheet);
  if (away !== null) return refused(away);

  const held = sheet.merges[0];
  const one = held === undefined ? null : located(held.node, read);
  const source = rangeOf(where.rect);
  const ops: readonly Op[] =
    one === null || one.kind === 'refused'
      ? [{ op: 'addSource', path: found.path, key: KEY.merges, source: `[${source}]` }]
      : [
          {
            op: 'insert',
            path: one.path.slice(0, -1),
            index: sheet.merges.length,
            value: source,
          },
        ];

  return written(found.file, ops, where);
}

/** The merges the selection touches, taken out; the key goes with the last of them. */
function apart(
  where: Merging,
  all: readonly CompiledMerge[],
  touched: readonly CompiledMerge[],
  read: Reading,
): Intent {
  const first = touched[0];
  if (first === undefined) return refused(say('intent.nothing-merged'));

  const found = located(first.node, read);
  if (found.kind === 'refused') return found;

  const paths = touched.map((one) => at(one, read)).filter((path) => path.length > 0);
  const ops: readonly Op[] =
    touched.length === all.length
      ? [{ op: 'remove', path: found.path.slice(0, -1) }]
      : paths.map((path) => ({ op: 'remove', path }));

  return written(found.file, ops, { ...where, rect: covered(touched) });
}

/** Where one merge is written, or nowhere — which drops it from the edit. */
function at(one: CompiledMerge, read: Reading): Path {
  const found = located(one.node, read);
  return found.kind === 'refused' ? [] : found.path;
}

/** The edit, claiming every cell the merge covers — which is what its drawing changes. */
function written(file: FilePath, ops: readonly Op[], where: Merging): Intent {
  const cells = new Set(addressesOf(where.rect).map((at) => qualified(where.sheet, at)));

  return { kind: 'edit', file, patch: { ops }, expects: { cells, beyond: 'ask' } };
}

/** Everything the merges taken out were covering, which is what their drawing changed. */
function covered(these: readonly CompiledMerge[]): Rect {
  return these.reduce(
    (one, than) => ({
      top: Math.min(one.top, than.rect.top),
      left: Math.min(one.left, than.rect.left),
      bottom: Math.max(one.bottom, than.rect.bottom),
      right: Math.max(one.right, than.rect.right),
    }),
    these[0]?.rect ?? { top: 1, left: 1, bottom: 1, right: 1 },
  );
}
