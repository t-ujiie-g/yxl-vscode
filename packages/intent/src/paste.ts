import {
  type CompiledCell,
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  type FacetOrigin,
  sheetOf,
} from '@yxl-vscode/compile';
import { type Op, type Path, renderScalar, type Value } from '@yxl-vscode/cst';
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
  type Holds,
  type Intent,
  literalPath,
  located,
  type Reading,
} from './direct';

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

  const ops = new Map<FilePath, Op[]>();
  const fresh: Entry[] = [];
  const cells = new Set<string>();
  const held: string[] = [];

  for (let row = where.from.rect.top; row <= where.from.rect.bottom; row += 1) {
    for (let col = where.from.rect.left; col <= where.from.rect.right; col += 1) {
      const cell = cellAt(from, addrAt({ col, row }));
      if (cell === null) continue;

      const holds = taking(cell, by);
      if (typeof holds === 'string') {
        held.push(holds);
        continue;
      }

      const at = addrAt({ col: col + by.cols, row: row + by.rows });
      const already = cellAt(to, at);
      if (already === null) {
        fresh.push({ at, holds });
        cells.add(qualified(where.to.sheet, at));
        continue;
      }

      const landed = landing(to, already.provenance.value, at, holds, read);
      if (typeof landed === 'string') {
        held.push(landed);
        continue;
      }

      ops.set(landed.file, [...(ops.get(landed.file) ?? []), ...landed.ops]);
      cells.add(qualified(where.to.sheet, at));
    }
  }

  if (held.length > 0 && !only) return refused(standing(cells.size - fresh.length, held));
  if (cells.size === 0) return refused('nothing in this rectangle can be pasted here');

  if (fresh.length > 0) {
    const made = entries(to, fresh, read);
    if (typeof made === 'string') return refused(made);

    ops.set(made.file, [...(ops.get(made.file) ?? []), ...made.ops]);
  }

  return together(grid, where, ops, cells, read);
}

/** One address nothing writes yet, and what is going into it. */
interface Entry {
  readonly at: A1Addr;
  readonly holds: Holds;
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
function landing(
  sheet: CompiledSheet,
  origin: FacetOrigin,
  at: A1Addr,
  holds: Holds,
  read: Reading,
): Landed | string {
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

/** Why a rectangle was not pasted: how many of how many, then the first cell's own reason. */
function standing(landing: number, held: readonly string[]): string {
  const total = landing + held.length;
  const others = held.length - 1;
  const rest = others === 0 ? '' : ` (and ${others} other${others === 1 ? '' : 's'} here)`;

  return `${held.length} of the ${total} cells here cannot be pasted, so none were: ${held[0]}${rest}`;
}

function refused(why: string): Intent & { kind: 'refused' } {
  return { kind: 'refused', why };
}
