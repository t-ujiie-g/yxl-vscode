import {
  type CompiledCell,
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  type FacetOrigin,
  sheetOf,
} from '@yxl-vscode/compile';
import { type Op, type Path, renderScalar, type Value } from '@yxl-vscode/cst';
import type { ScalarValue } from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  cellOf,
  type FilePath,
  moved,
  type Offset,
  qualified,
  type Rect,
  type SheetName,
} from '@yxl-vscode/units';
import { clearRange } from './clear';
import {
  beside,
  entryOp,
  entryText,
  type Found,
  type Held,
  type Holds,
  type Intent,
  literalPath,
  located,
  type Reading,
  standing,
  stood,
} from './direct';
import { meaning } from './typed';

/** A rectangle of cells copied in the grid, and the cell its top-left corner is going to. */
export interface Pasting {
  readonly from: { readonly sheet: SheetName; readonly rect: Rect };
  readonly to: { readonly sheet: SheetName; readonly at: A1Addr };
  readonly cut: boolean;
}

/**
 * A rectangle put somewhere else, as one edit: what each cell *holds* lands at
 * the offset, a formula with its references moved (ADR-031), and what the cell
 * it lands on *wears* stays. A cell that cannot be pasted refuses the whole
 * unless `only` says to leave it (ADR-001).
 */
export function pasteRange(
  grid: CompiledGrid,
  where: Pasting,
  read: Reading,
  only = false,
): Intent {
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

  const put = landed(to, where.to.sheet, going, read, held, only);
  if (typeof put === 'string') return refused(put);

  return together(grid, where, put.ops, put.cells, read);
}

/** One address a paste lands on, and what is going into it. */
interface Entry {
  readonly at: A1Addr;
  readonly holds: Holds;
}

/** What a paste comes to: the ops for the file it lands in, and the cells it names. */
interface Put {
  readonly ops: Map<FilePath, Op[]>;
  readonly cells: Set<string>;
}

/** Every cell of a paste written where it lands; one that cannot take it refuses the whole unless `only` (ADR-032). */
function landed(
  to: CompiledSheet,
  sheet: SheetName,
  going: readonly Entry[],
  read: Reading,
  refusals: readonly Held[],
  only: boolean,
): Put | string {
  const ops = new Map<FilePath, Op[]>();
  const fresh: Entry[] = [];
  const cells = new Set<string>();
  const held = [...refusals];

  for (const one of going) {
    const already = cellAt(to, one.at);
    if (already === null) {
      fresh.push(one);
      cells.add(qualified(sheet, one.at));
      continue;
    }

    const landing = into(to, already.provenance.value, one, read);
    if (typeof landing === 'string') {
      held.push({ at: one.at, why: landing, by: stood(already.provenance.value) });
      continue;
    }

    ops.set(landing.file, [...(ops.get(landing.file) ?? []), ...landing.ops]);
    cells.add(qualified(sheet, one.at));
  }

  if (held.length > 0 && !only) return standing(cells.size - fresh.length, held, 'pasted');
  if (cells.size === 0) return 'nothing in this rectangle can be pasted here';

  if (fresh.length > 0) {
    const made = entries(to, fresh, read);
    if (typeof made === 'string') return made;

    ops.set(made.file, [...(ops.get(made.file) ?? []), ...made.ops]);
  }

  return { ops, cells };
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

/** What one cell of the rectangle does where it lands: the ops that put it there, or why it cannot go. */
function into(
  sheet: CompiledSheet,
  origin: FacetOrigin,
  one: Entry,
  read: Reading,
): Landed | string {
  const { at, holds } = one;
  const found = literalPath(origin, sheet, at, read);
  if (found.kind === 'refused') return `\`${at}\` cannot be written: ${found.why}`;

  if (origin.kind === 'inline') {
    if ('formula' in holds)
      return `\`${at}\` is a field of a \`data:\` block, which holds no formula`;

    const path = [...found.path, 'values', origin.row, origin.col];
    return { file: found.file, ops: [{ op: 'set', path, value: holds.value }] };
  }

  return { file: found.file, ops: keys(found, holds) };
}

/** The ops for one file, where a paste lands in exactly one. */
interface Landed {
  readonly file: FilePath;
  readonly ops: readonly Op[];
}

/** The addresses nothing writes yet, as `cells:` entries; the `cells:` key itself can only be written once (ADR-032). */
function entries(sheet: CompiledSheet, fresh: readonly Entry[], read: Reading): Landed | string {
  const found = located(sheet.node, read);
  if (found.kind === 'refused') return `these cells cannot be written: ${found.why}`;
  if (found.node.kind !== 'map') return 'these cells cannot be written: the sheet is not a mapping';

  const has = found.node.entries.some((entry) => entry.key.value === 'cells');
  if (!has) {
    const source = fresh.map((one) => entryText(one.at, one.holds)).join('\n');
    return { file: found.file, ops: [{ op: 'addSource', path: found.path, key: 'cells', source }] };
  }

  // Entries added at one place are spliced from the end of the file, so the
  // last one laid down is the first one read.
  const path = [...found.path, 'cells'];
  const ops = [...fresh].reverse().map((one) => entryOp(path, true, one.at, one.holds));

  return { file: found.file, ops };
}

/** What a cell holds as it would apply where it is going: a formula moves with it (ADR-031). */
function taking(cell: CompiledCell, by: Offset): Holds | string {
  if (cell.rich !== null) return `\`${cell.at}\` holds rich text, which this editor does not paste`;
  if (cell.formula === null) return { value: cell.value };

  const origin = cell.provenance.value;
  const away =
    origin.kind === 'formulaRange'
      ? { cols: by.cols + origin.offset[0], rows: by.rows + origin.offset[1] }
      : by;

  const done = moved(cell.formula, away);
  return done.ok ? { formula: done.formula } : `\`${cell.at}\` holds a formula that ${done.why}`;
}

/** What a cell holds, written into the entry that is already there; what it wears is left alone. */
function keys(found: Found & { kind: 'found' }, holds: Holds): Op[] {
  const key = 'formula' in holds ? 'formula' : 'value';
  const value = ('formula' in holds ? holds.formula : holds.value) as Value;

  if (found.node.kind !== 'map') {
    return key === 'value'
      ? [{ op: 'set', path: found.path, value }]
      : [
          {
            op: 'write',
            path: found.path,
            source: `{ formula: ${renderScalar(value, 'double')} }`,
          },
        ];
  }

  const written = found.node.entries.map((entry) => String(entry.key.value));
  const ops: Op[] = written
    .filter((one) => HOLDS.has(one) && one !== key)
    .map((one) => ({ op: 'remove', path: [...found.path, one] }));

  ops.push(
    written.includes(key)
      ? { op: 'set', path: [...found.path, key], value }
      : entered(found.path, key, holds, written[0] ?? null),
  );

  return ops;
}

/** A key a cell did not have, a value ahead of what it wears and a formula after it. */
function entered(path: Path, key: string, holds: Holds, before: string | null): Op {
  return 'formula' in holds
    ? { op: 'add', path, key, value: holds.formula, before: null }
    : { op: 'add', path, key, value: holds.value, before };
}

/** What a cell holds, against what it wears — the same list emptying a cell works from. */
const HOLDS = new Set(['value', 'formula', 'rich', 'type']);

/** Whether the rectangle would land on itself, which is what a cut cannot do. */
function overlaps(rect: Rect, by: Offset): boolean {
  return Math.abs(by.cols) <= rect.right - rect.left && Math.abs(by.rows) <= rect.bottom - rect.top;
}

function refused(why: string): Intent & { kind: 'refused' } {
  return { kind: 'refused', why };
}

/** How a rectangle from outside the spec lands: as the cells it is, or as one `data:` block (§8 Q11). */
export type Shape = 'cells' | 'data';

/**
 * A rectangle from another spreadsheet put down at an address. The fields mean
 * what they would mean typed into a cell, and the shape is the reader's answer
 * rather than a guess (ADR-028).
 */
export function pasteText(
  grid: CompiledGrid,
  where: { sheet: SheetName; at: A1Addr },
  rows: readonly (readonly string[])[],
  read: Reading,
  shape: Shape,
  only = false,
): Intent {
  const to = sheetOf(grid, where.sheet);
  if (to === null) return refused(`there is no sheet named \`${where.sheet}\``);
  if (rows.length === 0) return refused('there is nothing on the clipboard to put down');

  const corner = cellOf(where.at);
  const going: Entry[] = [];
  for (const [down, row] of rows.entries()) {
    for (const [across, field] of row.entries()) {
      const at = addrAt({ col: corner.col + across, row: corner.row + down });
      going.push({ at, holds: held(field) });
    }
  }

  if (shape === 'data') return block(grid, to, where, rows, read);

  const put = landed(to, where.sheet, going, read, [], only);
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

  const already = found.node.entries.find((entry) => entry.key.value === 'data')?.value;
  const op: Op =
    already !== undefined && already.kind === 'seq'
      ? {
          op: 'insertSource',
          path: [...found.path, 'data'],
          index: already.items.length,
          source: body,
        }
      : {
          op: 'addSource',
          path: found.path,
          key: 'data',
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

/** What a field off the clipboard would mean typed into a cell. */
function held(field: string): Holds {
  const meant = meaning(field);
  if (meant.is === 'formula') return { formula: meant.body };

  return { value: meant.is === 'value' ? meant.value : null };
}

/** The same, as the scalar a `data:` row holds. */
function value(field: string): ScalarValue {
  const meant = meaning(field);
  return meant.is === 'value' ? meant.value : null;
}
