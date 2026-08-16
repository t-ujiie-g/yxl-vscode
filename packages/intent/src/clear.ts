import { type CompiledGrid, cellAt, sheetOf } from '@yxl-vscode/compile';
import type { Node, Op, Path } from '@yxl-vscode/cst';
import {
  type A1Addr,
  addrAt,
  type FilePath,
  qualified,
  type Rect,
  type SheetName,
} from '@yxl-vscode/units';
import { beside, type Intent, located, setValue, type Text } from './direct';

/**
 * Emptying a cell. A cell with nothing in it is not something the format can
 * say (`docs/spec.md` §3), so the entry is taken out and what it *wears* stays:
 * `{ value: 1, style: header }` keeps its style. A `data:` field is the
 * exception — `null` in a row is a blank cell (§9) — and takes the ordinary write.
 */
export function clearCell(
  grid: CompiledGrid,
  where: { sheet: SheetName; at: A1Addr },
  text: Text,
): Intent {
  const sheet = sheetOf(grid, where.sheet);
  if (sheet === null) return setValue(grid, where, null, text);

  const cell = cellAt(sheet, where.at);
  const origin = cell?.provenance.value;
  if (origin?.kind !== 'literal' && origin?.kind !== 'override') {
    return setValue(grid, where, null, text);
  }

  const found = located(origin.node, text);
  if (found.kind === 'refused') return found;

  return {
    kind: 'edit',
    file: found.file,
    patch: { ops: emptying(found.node, found.path) },
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
 * Emptying every cell of a rectangle, as one edit. Applied only where every
 * cell in it can be emptied directly; one that cannot — filled by a range, read
 * from a file — refuses the whole, naming how many and why (ADR-001).
 */
export function clearRange(
  grid: CompiledGrid,
  where: { sheet: SheetName; rect: Rect },
  text: Text,
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

      const one = clearCell(grid, { sheet: where.sheet, at }, text);
      if (one.kind === 'refused') {
        held.push(one.why);
        continue;
      }
      if (one.kind !== 'edit') continue;

      ops.set(one.file, [...(ops.get(one.file) ?? []), ...one.patch.ops]);
      cells.add(qualified(where.sheet, at));
    }
  }

  if (held.length > 0) return { kind: 'refused', why: standing(cells.size, held) };
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
    patch: { ops: ops.get(file) ?? [] },
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
