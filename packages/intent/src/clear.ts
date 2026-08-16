import { type CompiledGrid, cellAt, sheetOf } from '@yxl-vscode/compile';
import { type Node, nodeAt, type Op, type Path } from '@yxl-vscode/cst';
import {
  type A1Addr,
  addrAt,
  type FilePath,
  qualified,
  type Rect,
  type SheetName,
} from '@yxl-vscode/units';
import { beside, type Intent, located, type Reading, setValue } from './direct';

/**
 * Emptying a cell. A cell with nothing in it is not something the format can
 * say (`docs/spec.md` §3), so the entry is taken out and what it *wears* stays:
 * `{ value: 1, style: header }` keeps its style. A `data:` field is the
 * exception — `null` in a row is a blank cell (§9) — and takes the ordinary write.
 */
export function clearCell(
  grid: CompiledGrid,
  where: { sheet: SheetName; at: A1Addr },
  read: Reading,
): Intent {
  const sheet = sheetOf(grid, where.sheet);
  if (sheet === null) return setValue(grid, where, null, read);

  const cell = cellAt(sheet, where.at);
  const origin = cell?.provenance.value;
  if (origin?.kind !== 'literal' && origin?.kind !== 'override') {
    return setValue(grid, where, null, read);
  }

  const found = located(origin.node, read);
  if (found.kind === 'refused') return found;

  return {
    kind: 'edit',
    file: found.file,
    patch: { ops: whole(emptying(found.node, found.path), found.file, read) },
    expects: { cells: new Set([qualified(where.sheet, where.at)]), beyond: 'ask' },
  };
}

/** What a cell holds, against what it wears. */
const HOLDS = new Set(['value', 'formula', 'rich', 'type']);
const WEARS = new Set(['format', 'style']);

/** The keys the cell holds something in, or the whole entry where nothing else would be left. */
function emptying(node: Node, path: Path): Op[] {
  if (node.kind !== 'map') return [{ op: 'remove', path }];

  const keys = node.entries.map((entry) => String(entry.key.value));
  if (!keys.some((key) => WEARS.has(key))) return [{ op: 'remove', path }];

  return keys
    .filter((key) => HOLDS.has(key))
    .map((key) => ({ op: 'remove', path: [...path, key] }));
}

/**
 * Emptying every cell of a rectangle, as one edit. A cell that cannot be
 * emptied — filled by a range, read from a file — refuses the whole and names
 * how many stood in the way, unless `only` says to leave them (ADR-001).
 */
export function clearRange(
  grid: CompiledGrid,
  where: { sheet: SheetName; rect: Rect },
  read: Reading,
  only = false,
  adding: readonly Op[] = [],
): Intent {
  const sheet = sheetOf(grid, where.sheet);
  if (sheet === null) return { kind: 'refused', why: `there is no sheet named \`${where.sheet}\`` };

  const ops = new Map<FilePath, Op[]>();
  const cells = new Set<string>();
  const held: string[] = [];

  for (let row = where.rect.top; row <= where.rect.bottom; row += 1) {
    for (let col = where.rect.left; col <= where.rect.right; col += 1) {
      const at = addrAt({ col, row });
      if (cellAt(sheet, at) === null) continue;

      const one = clearCell(grid, { sheet: where.sheet, at }, read);
      if (one.kind === 'refused') {
        held.push(one.why);
        continue;
      }
      if (one.kind !== 'edit') continue;

      ops.set(one.file, [...(ops.get(one.file) ?? []), ...one.patch.ops]);
      cells.add(qualified(where.sheet, at));
    }
  }

  if (held.length > 0 && !only) return { kind: 'refused', why: standing(cells.size, held) };
  if (cells.size === 0) {
    return { kind: 'refused', why: 'nothing in this range holds anything to empty' };
  }

  const files = [...ops.keys()];
  const file = files[0];
  if (file === undefined || files.length > 1) {
    return {
      kind: 'refused',
      why: `this range is written across ${files.map(beside).join(' and ')}, and this editor empties one file at a time`,
    };
  }

  return {
    kind: 'edit',
    file,
    patch: { ops: whole(ops.get(file) ?? [], file, read, adding) },
    expects: { cells, beyond: 'ask' },
  };
}

/** Why a range was not emptied: how many of how many, then the first cell's own reason. */
function standing(cleared: number, held: readonly string[]): string {
  const total = cleared + held.length;
  const others = held.length - 1;
  const rest = others === 0 ? '' : ` (and ${others} other${others === 1 ? '' : 's'} here)`;

  return `${held.length} of the ${total} cells here cannot be emptied, so none were: ${held[0]}${rest}`;
}

/** The same removals, with a mapping whose every entry is going taken out whole: an empty `cells:` will not load. */
function whole(
  ops: readonly Op[],
  file: FilePath,
  read: Reading,
  adding: readonly Op[] = [],
): Op[] {
  const root = read.parsed(file)?.root ?? null;
  if (root === null) return [...ops];

  const going = new Set(ops.filter((one) => one.op === 'remove').map((one) => mark(one.path)));
  const emptied = new Set<string>();
  const done: Op[] = [];

  for (const op of ops) {
    const parent = op.op === 'remove' ? op.path.slice(0, -1) : null;
    if (parent === null || parent.length === 0 || !leftEmpty(root, parent, going, adding)) {
      done.push(op);
      continue;
    }
    if (emptied.has(mark(parent))) continue;

    emptied.add(mark(parent));
    done.push({ op: 'remove', path: parent });
  }

  return done;
}

/** Whether every entry of the mapping at `path` is going, with nothing the same patch adds left in it. */
function leftEmpty(
  root: Node,
  path: Path,
  going: ReadonlySet<string>,
  adding: readonly Op[],
): boolean {
  const holder = nodeAt(root, path);
  if (holder === null || holder.kind !== 'map' || holder.entries.length === 0) return false;
  if (fills(path, adding)) return false;

  return holder.entries.every((entry) => going.has(mark([...path, String(entry.key.value)])));
}

/** Whether the patch puts something into the mapping at `path`, which is what keeps it. */
function fills(path: Path, adding: readonly Op[]): boolean {
  const here = mark(path);
  const inside = `${here.slice(0, -1)},`;

  return adding.some((one) => mark(one.path) === here || mark(one.path).startsWith(inside));
}

/** A path as one comparable string, so a removal can be asked what else is going. */
function mark(path: Path): string {
  return JSON.stringify(path);
}
