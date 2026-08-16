import { type CompiledGrid, cellAt, sheetOf } from '@yxl-vscode/compile';
import type { Node, Op, Path } from '@yxl-vscode/cst';
import { type A1Addr, qualified, type SheetName } from '@yxl-vscode/units';
import { type Intent, located, setValue, type Text } from './direct';

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
