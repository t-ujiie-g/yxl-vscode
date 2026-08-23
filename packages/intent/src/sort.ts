import { cellAt, sheetOf } from '@yxl-vscode/compile';
import { nodeAt, type Op } from '@yxl-vscode/cst';
import type { ScalarValue } from '@yxl-vscode/spec';
import { addrAt, qualified, type Rect, type SheetName } from '@yxl-vscode/units';
import { type Intent, located, type Projection, type Reading, refused } from './direct';
import { blocks } from './shift';

/** Rows of one `data:` block to be put in order, by the column the selection starts in. */
export interface Sorting {
  readonly sheet: SheetName;
  readonly rect: Rect;
  readonly down: boolean;
}

/**
 * The rows of a `data:` block in another order, and nothing else touched: each
 * row is written where it now goes **as the file wrote it**, so what a sort
 * changes is the order of the lines and nothing about any of them.
 */
export function setSorted(spec: Projection, where: Sorting, read: Reading): Intent {
  const sheet = sheetOf(spec.grid, where.sheet);
  if (sheet === null) return refused(`there is no sheet named \`${where.sheet}\``);
  if (where.rect.bottom - where.rect.top < 1) {
    return refused('a sort is more than one row, so there is nothing here to put in order');
  }

  const block = blocks(sheet).find(
    (one) =>
      one.file === null &&
      one.rect.top <= where.rect.top &&
      where.rect.bottom <= one.rect.bottom &&
      one.rect.left <= where.rect.left &&
      where.rect.left <= one.rect.right,
  );
  if (block === undefined) {
    return refused('these rows are not a table written here, so there is no order to put them in');
  }

  const found = located(block.node, read);
  if (found.kind === 'refused') return found;

  const source = read.text(found.file);
  if (source === null) return refused(`\`${found.file}\` could not be read`);

  const first = where.rect.top - block.rect.top;
  const rows: { at: number; by: ScalarValue; source: string }[] = [];

  for (let row = where.rect.top; row <= where.rect.bottom; row += 1) {
    const at = row - block.rect.top;
    const item = nodeAt(found.node, ['values', at]);
    if (item === undefined || item === null) {
      return refused(`row ${row} is not written in this table, so it has nothing to move`);
    }
    if (item.kind !== 'seq' || !item.flow) {
      return refused('rows written a line at a time are not put in order yet');
    }

    rows.push({
      at,
      by: cellAt(sheet, addrAt({ col: where.rect.left, row }))?.value ?? null,
      source: source.slice(item.span.start, item.span.end),
    });
  }

  const put = [...rows].sort((one, than) =>
    where.down ? after(than.by, one.by) : after(one.by, than.by),
  );
  const ops: Op[] = [];
  const cells = new Set<string>();

  for (const [index, row] of put.entries()) {
    const to = first + index;
    for (let col = block.rect.left; col <= block.rect.right; col += 1) {
      cells.add(qualified(where.sheet, addrAt({ col, row: block.rect.top + to })));
    }
    if (row.at === to) continue;

    ops.push({ op: 'write', path: [...found.path, 'values', to], source: row.source });
  }

  if (ops.length === 0) return refused('these rows are in that order already');

  return { kind: 'edit', file: found.file, patch: { ops }, expects: { cells, beyond: 'ask' } };
}

/** Which of two fields comes first: numbers, then text, then nothing, as Excel orders a column. */
function after(one: ScalarValue, than: ScalarValue): number {
  const rank = (value: ScalarValue) =>
    value === null ? 3 : typeof value === 'number' ? 0 : typeof value === 'boolean' ? 2 : 1;

  const mine = rank(one);
  if (mine !== rank(than)) return mine - rank(than);
  if (typeof one === 'number' && typeof than === 'number') return one - than;

  return String(one).localeCompare(String(than));
}
