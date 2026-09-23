import type { Node } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import { type Anchor, type ByMeaning, MODELED_KEYS, type ScalarValue } from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, keyOf, reject } from './ctx';
import {
  expectNumber,
  expectText,
  expectValue,
  findEntry,
  open,
  openEntries,
  required,
} from './read';
import { ADDRESS, readAs } from './template';
import { say, under } from './text';

/** Where a layout, a float or a `data:` block sits: a cell, or `{ below: layout, gap }` (`docs/spec.md` §25). */
export function readAnchor(ctx: Ctx, node: Node, what: Saying): Anchor | null {
  if (node.kind !== 'map') return readAs(ctx, node, what, ADDRESS);

  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.below);
  if (opened === null) return null;

  const layout = required(opened, 'below', what, (one) =>
    expectText(opened.ctx, one, under(what, 'below')),
  );
  if (layout === null) return null;

  const gap = findEntry(opened.entries, 'gap');
  if (gap === undefined) return { kind: 'below', layout, gap: 1 };

  const rows = expectNumber(opened.ctx, gap.value, under(what, 'gap'));
  return rows === null ? null : { kind: 'below', layout, gap: rows };
}

/** An override's `at:` given by meaning: `{ layout, column, where | row }` (`docs/spec.md` §25). */
export function readByMeaning(ctx: Ctx, node: Node, what: Saying): ByMeaning | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.byMeaning);
  if (opened === null) return null;
  const here = opened.ctx;

  const text = (key: string) => (one: Node) => expectText(here, one, under(what, key));
  const layout = required(opened, 'layout', what, text('layout'));
  const column = required(opened, 'column', what, text('column'));
  if (layout === null || column === null) return null;

  const where = findEntry(opened.entries, 'where');
  const row = findEntry(opened.entries, 'row');
  if ((where === undefined) === (row === undefined)) {
    reject(here, CODE.conflictingKeys, say('loader.where-or-row', { what }), opened.node.span);
    return null;
  }

  if (row !== undefined) {
    const number = expectNumber(here, row.value, under(what, 'row'));
    return number === null ? null : { kind: 'layout', layout, column, where: null, row: number };
  }

  const matched = readWhere(here, where?.value ?? node, under(what, 'where'));
  return matched === null ? null : { kind: 'layout', layout, column, where: matched, row: null };
}

function readWhere(ctx: Ctx, node: Node, what: Saying): [string, ScalarValue][] | null {
  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;

  const pairs: [string, ScalarValue][] = [];
  for (const entry of opened.entries) {
    const value = expectValue(opened.ctx, entry.value, under(what, keyOf(entry)));
    if (value !== null) pairs.push([keyOf(entry), value]);
  }
  return pairs;
}
