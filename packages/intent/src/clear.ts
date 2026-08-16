import { type CompiledGrid, cellAt } from '@yxl-vscode/compile';
import type { Node, Op, Path } from '@yxl-vscode/cst';
import { type A1Addr, qualified, type SheetName } from '@yxl-vscode/units';
import { type Intent, located, setValue, type Text } from './direct';

/**
 * Emptying a cell — the Delete key, and an edit box left with nothing in it.
 *
 * Not a value of its own: a cell with nothing in it is not something this
 * format can say. `A1:` with no value is refused by the compiler, because a
 * cell needs at least one of `value`, `formula`, `rich`, `style`, or `format`
 * (`docs/spec.md` §3). So emptying one *takes the entry out*, and what stays
 * behind is what a spreadsheet leaves behind: the look. A cell written
 * `{ value: 1, style: header }` keeps its style and loses its value; one
 * written `A1: 1` goes altogether.
 *
 * A field of a `data:` block is the exception, and the format's own: `null` in
 * a row is a blank cell (`docs/spec.md` §9), so there the ordinary write says
 * it.
 */
export function clearCell(
  grid: CompiledGrid,
  where: { sheet: SheetName; at: A1Addr },
  text: Text,
): Intent {
  const sheet = grid.sheets.find((one) => one.name === where.sheet);
  if (sheet === undefined) return setValue(grid, where, null, text);

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

/**
 * The ops that empty the cell: the keys it holds something in, or the whole
 * entry where emptying it would leave nothing behind.
 */
function emptying(node: Node, path: Path): Op[] {
  if (node.kind !== 'map') return [{ op: 'remove', path }];

  const keys = node.entries.map((entry) => String(entry.key.value));
  if (!keys.some((key) => WEARS.has(key))) return [{ op: 'remove', path }];

  return keys
    .filter((key) => HOLDS.has(key))
    .map((key) => ({ op: 'remove', path: [...path, key] }));
}
