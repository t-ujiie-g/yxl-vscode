import { cellAt, sheetOf } from '@yxl-vscode/compile';
import { sentence } from '@yxl-vscode/diag';
import type { A1Addr, SheetName } from '@yxl-vscode/units';
import {
  beside,
  type Held,
  holding,
  type Intent,
  type Projection,
  type Reading,
  refused,
} from './direct';
import { type Entry, landed } from './landing';
import type { Standing } from './paste';
import { say } from './text';

/** A replacement as a gesture asks for it: what was looked for, what goes there, and where it was found. */
export interface Replacing {
  readonly sheet: SheetName;
  readonly at: readonly A1Addr[];
  readonly looking: string;
  readonly becomes: string;
}

/**
 * What a find turned up, written again with the text replaced — one edit over
 * every cell rather than one per cell, so a cell that cannot take it refuses
 * the whole and is counted with its group (§8 Q14).
 */
export function replaceIn(
  spec: Projection,
  where: Replacing,
  read: Reading,
  doing: Standing = 'refuse',
): Intent {
  const sheet = sheetOf(spec.grid, where.sheet);
  if (sheet === null) return refused(say('intent.no-such-sheet', { sheet: where.sheet }));
  if (where.looking === '') return refused(say('intent.nothing-to-look-for'));

  const going: Entry[] = [];
  const held: Held[] = [];

  for (const at of where.at) {
    const cell = cellAt(sheet, at);
    if (cell === null) continue;

    const said = written(cell.value, cell.formula, where);
    if (said !== null) {
      going.push({ at, holds: holding(said) });
      continue;
    }

    // Found by its cached result rather than by its formula: what matched is
    // Excel's answer, and typing over it would be writing down a guess.
    held.push({
      at,
      why: `\`${at}\` holds a formula, and what matched is the value cached under it`,
      by: 'formula',
    });
  }

  if (going.length === 0 && held.length === 0) {
    return refused(say('intent.nothing-holds-that', { sheet: where.sheet }));
  }

  const put = landed(spec, sheet, where.sheet, going, read, {
    doing,
    refusals: held,
    verb: 'replaced',
    nothing: 'none of what was found can be written here',
  });
  if (sentence(put)) return refused(put);

  const files = [...put.ops.keys()];
  const file = files[0];
  if (file === undefined || files.length > 1) {
    return refused(say('intent.found-across-files', { files: files.map(beside).join(' and ') }));
  }

  return {
    kind: 'edit',
    file,
    patch: { ops: put.ops.get(file) ?? [] },
    expects: { cells: put.cells, beyond: 'ask' },
  };
}

/** What one cell holds after it, or `null` where it does not hold the text; a formula goes back as one. */
function written(
  value: string | number | boolean | null,
  formula: string | null,
  where: Replacing,
): string | null {
  if (formula !== null) {
    const said = swapped(formula, where);
    return said === null ? null : `=${said}`;
  }

  return value === null ? null : swapped(String(value), where);
}

/** The text with every match replaced, or `null` where there is none; found without case, as a find is. */
function swapped(text: string, where: Replacing): string | null {
  const looking = where.looking.toLowerCase();
  const lowered = text.toLowerCase();
  if (!lowered.includes(looking)) return null;

  let said = '';
  let at = 0;
  for (let found = lowered.indexOf(looking); found >= 0; found = lowered.indexOf(looking, at)) {
    said += text.slice(at, found) + where.becomes;
    at = found + looking.length;
  }

  return said + text.slice(at);
}
