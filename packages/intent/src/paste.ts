import { type CompiledGrid, type CompiledSheet, cellAt, sheetOf } from '@yxl-vscode/compile';
import { entryOf, type Op, renderScalar } from '@yxl-vscode/cst';
import { KEY, type ScalarValue } from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  cellOf,
  type FilePath,
  type Offset,
  qualified,
  type Rect,
  type SheetName,
} from '@yxl-vscode/units';
import { clearRange } from './clear';
import {
  beside,
  type Held,
  holding,
  type Intent,
  located,
  type Reading,
  refused,
  type Stood,
} from './direct';
import { type Entry, landed, taking } from './landing';
import { meaning } from './typed';
import type { Projection } from './writes';

/** A rectangle of cells copied in the grid, and the cell its top-left corner is going to. */
export interface Pasting {
  readonly from: { readonly sheet: SheetName; readonly rect: Rect };
  readonly to: { readonly sheet: SheetName; readonly at: A1Addr };
  readonly cut: boolean;
}

/**
 * What a rectangle does about the cells that stood in its way (ADR-001):
 * refuse the whole, leave them where they are, or write the ones of one origin
 * as the exception that origin allows and leave the others.
 */
export type Standing = 'refuse' | 'skip' | Stood;

/**
 * A rectangle put somewhere else, as one edit: what each cell *holds* lands at
 * the offset, a formula with its references moved (ADR-031), and what the cell
 * it lands on *wears* stays. One that cannot be pasted is `doing`'s to answer.
 */
export function pasteRange(
  spec: Projection,
  where: Pasting,
  read: Reading,
  doing: Standing = 'refuse',
): Intent {
  const grid = spec.grid;
  const from = sheetOf(grid, where.from.sheet);
  const to = sheetOf(grid, where.to.sheet);
  if (from === null) return refused(`there is no sheet named \`${where.from.sheet}\``);
  if (to === null) return refused(`there is no sheet named \`${where.to.sheet}\``);

  const corner = cellOf(where.to.at);
  const by = { cols: corner.col - where.from.rect.left, rows: corner.row - where.from.rect.top };
  const still = where.from.sheet === where.to.sheet && by.cols === 0 && by.rows === 0;
  if (still) return refused('these cells are already here');

  if (where.cut && where.from.sheet === where.to.sheet && overlaps(where.from.rect, by)) {
    return refused('a cut cannot land on the cells it is taking, and these overlap');
  }

  const going: Entry[] = [];
  const held: Held[] = [];

  for (let row = where.from.rect.top; row <= where.from.rect.bottom; row += 1) {
    for (let col = where.from.rect.left; col <= where.from.rect.right; col += 1) {
      const cell = cellAt(from, addrAt({ col, row }));
      if (cell === null) continue;

      const holds = taking(cell, by);
      if (typeof holds !== 'string') {
        going.push({ at: addrAt({ col: col + by.cols, row: row + by.rows }), holds });
        continue;
      }

      held.push({ at: cell.at, why: holds, by: cell.rich === null ? 'formula' : 'rich' });
    }
  }

  const put = landed(spec, to, where.to.sheet, going, read, {
    doing,
    refusals: held,
    verb: 'pasted',
    nothing: 'nothing in this rectangle can be pasted here',
  });
  if (typeof put === 'string') return refused(put);

  return together(grid, where, put.ops, put.cells, read);
}

/** The edit, once every cell of the rectangle has said where it lands; a cut empties the source too. */
function together(
  grid: CompiledGrid,
  where: Pasting,
  ops: ReadonlyMap<FilePath, Op[]>,
  cells: ReadonlySet<string>,
  read: Reading,
): Intent {
  const files = [...ops.keys()];
  const file = files[0];
  if (file === undefined || files.length > 1) {
    return refused(
      `this rectangle would be written across ${files.map(beside).join(' and ')}, and this editor writes one file at a time`,
    );
  }

  const put = ops.get(file) ?? [];
  if (!where.cut)
    return { kind: 'edit', file, patch: { ops: put }, expects: { cells, beyond: 'ask' } };

  const taken = clearRange(
    grid,
    { sheet: where.from.sheet, rect: where.from.rect },
    read,
    true,
    put,
  );
  if (taken.kind === 'refused') return taken;
  if (taken.kind !== 'edit') return refused('the cells this cut takes are not in a spec file');
  if (taken.file !== file) {
    return refused(
      `this cut would take from ${beside(taken.file)} and write to ${beside(file)}, and this editor writes one file at a time`,
    );
  }

  return {
    kind: 'edit',
    file,
    patch: { ops: [...put, ...taken.patch.ops] },
    expects: { cells: new Set([...cells, ...taken.expects.cells]), beyond: 'ask' },
  };
}

/** Whether the rectangle would land on itself, which is what a cut cannot do. */
function overlaps(rect: Rect, by: Offset): boolean {
  return Math.abs(by.cols) <= rect.right - rect.left && Math.abs(by.rows) <= rect.bottom - rect.top;
}

/** How a rectangle from outside the spec lands: as the cells it is, or as one `data:` block (§8 Q11). */
export type Shape = 'cells' | 'data';

/**
 * A rectangle from another spreadsheet put down at an address. The fields mean
 * what they would mean typed into a cell, and the shape is the reader's answer
 * rather than a guess (ADR-028).
 */
export function pasteText(
  spec: Projection,
  where: { sheet: SheetName; at: A1Addr },
  rows: readonly (readonly string[])[],
  read: Reading,
  shape: Shape,
  doing: Standing = 'refuse',
): Intent {
  const grid = spec.grid;
  const to = sheetOf(grid, where.sheet);
  if (to === null) return refused(`there is no sheet named \`${where.sheet}\``);
  if (rows.length === 0) return refused('there is nothing on the clipboard to put down');

  const corner = cellOf(where.at);
  const going: Entry[] = [];
  for (const [down, row] of rows.entries()) {
    for (const [across, field] of row.entries()) {
      const at = addrAt({ col: corner.col + across, row: corner.row + down });
      going.push({ at, holds: holding(field) });
    }
  }

  if (shape === 'data') return block(grid, to, where, rows, read);

  const put = landed(spec, to, where.sheet, going, read, {
    doing,
    verb: 'pasted',
    nothing: 'nothing in this rectangle can be pasted here',
  });
  if (typeof put === 'string') return refused(put);

  const written = [...put.ops.keys()];
  const file = written[0];
  if (file === undefined || written.length > 1) {
    return refused(
      `this rectangle would be written across ${written.map(beside).join(' and ')}, and this editor writes one file at a time`,
    );
  }

  return {
    kind: 'edit',
    file,
    patch: { ops: put.ops.get(file) ?? [] },
    expects: { cells: put.cells, beyond: 'ask' },
  };
}

/** Whether a rectangle could land as a `data:` block: only where nothing writes those cells already. */
export function couldBlock(
  grid: CompiledGrid,
  where: { sheet: SheetName; at: A1Addr },
  rows: readonly (readonly string[])[],
): boolean {
  const to = sheetOf(grid, where.sheet);
  if (to === null || rows.length === 0) return false;

  const corner = cellOf(where.at);

  return rows.every((row, down) =>
    row.every(
      (_field, across) =>
        cellAt(to, addrAt({ col: corner.col + across, row: corner.row + down })) === null,
    ),
  );
}

/** The rectangle as one `data:` block with its rows inline (`docs/spec.md` §9). */
function block(
  grid: CompiledGrid,
  to: CompiledSheet,
  where: { sheet: SheetName; at: A1Addr },
  rows: readonly (readonly string[])[],
  read: Reading,
): Intent {
  if (!couldBlock(grid, where, rows)) {
    return refused('a `data:` block can only go where nothing writes those cells yet');
  }

  const found = located(to.node, read);
  if (found.kind === 'refused') return found;
  if (found.node.kind !== 'map') return refused('this sheet is not a mapping');

  const body = [
    `at: ${where.at}`,
    'values:',
    ...rows.map(
      (row) => `  - [${row.map((field) => renderScalar(value(field), 'double')).join(', ')}]`,
    ),
  ].join('\n');

  const already = entryOf(found.node, KEY.data)?.value;
  const op: Op =
    already !== undefined && already.kind === 'seq'
      ? {
          op: 'insertSource',
          path: [...found.path, KEY.data],
          index: already.items.length,
          source: body,
        }
      : {
          op: 'addSource',
          path: found.path,
          key: KEY.data,
          source: `- ${body.replace(/\n/g, '\n  ')}`,
        };

  const corner = cellOf(where.at);
  const cells = new Set<string>();
  for (const [down, row] of rows.entries()) {
    for (const across of row.keys()) {
      cells.add(
        qualified(where.sheet, addrAt({ col: corner.col + across, row: corner.row + down })),
      );
    }
  }

  return {
    kind: 'edit',
    file: found.file,
    patch: { ops: [op] },
    expects: { cells, beyond: 'ask' },
  };
}

/** The same, as the scalar a `data:` row holds. */
function value(field: string): ScalarValue {
  const meant = meaning(field);
  return meant.is === 'value' ? meant.value : null;
}
