import { type CompiledSheet, cellAt, sheetOf } from '@yxl-vscode/compile';
import { type Saying, sentence } from '@yxl-vscode/diag';
import { type Axis, KEY } from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  addressesOf,
  qualified,
  type Rect,
  rangeOf,
  type SheetName,
} from '@yxl-vscode/units';
import { putEntries, sequenceIn } from './anchored';
import { type Held, keptElsewhere, located, type Projection, type Reading } from './direct';
import { type Entry, landed, taking } from './landing';
import type { Candidate } from './resolve';
import { say } from './text';

/** A rectangle to be filled from its first line: down from the top row, or right from the left column. */
export interface Filling {
  readonly sheet: SheetName;
  readonly rect: Rect;
  readonly axis: Axis;
}

/**
 * The ways a fill can be written: one `formulas:` range where the line holds
 * formulas — which is what Excel's own fill makes of one (`docs/spec.md` §3) —
 * and a cell of its own for each address either way.
 */
export function setFilled(spec: Projection, where: Filling, read: Reading): readonly Candidate[] {
  const sheet = sheetOf(spec.grid, where.sheet);
  if (sheet === null) return [];

  const down = where.axis === 'row';
  const line = down ? where.rect.bottom - where.rect.top : where.rect.right - where.rect.left;
  if (line < 1) return [];

  const answers: Candidate[] = [];
  const range = asRange(sheet, where, read);
  if (range !== null) answers.push(range);

  const cells = onCells(spec, sheet, where, read);
  if (cells !== null) answers.push(cells);

  return answers;
}

/** Every address the fill writes, and what it holds once it has moved there. */
function going(sheet: CompiledSheet, where: Filling): Entry[] | Saying {
  const down = where.axis === 'row';
  const entries: Entry[] = [];

  const from = down ? where.rect.top : where.rect.left;
  const to = down ? where.rect.bottom : where.rect.right;
  const across = down
    ? { first: where.rect.left, last: where.rect.right }
    : { first: where.rect.top, last: where.rect.bottom };

  for (let one = across.first; one <= across.last; one += 1) {
    const source = down ? addrAt({ col: one, row: from }) : addrAt({ col: from, row: one });
    const cell = cellAt(sheet, source);
    if (cell === null) continue;

    for (let along = from + 1; along <= to; along += 1) {
      const at = down ? addrAt({ col: one, row: along }) : addrAt({ col: along, row: one });
      const by = down ? { cols: 0, rows: along - from } : { cols: along - from, rows: 0 };
      const holds = taking(cell, by);
      if (sentence(holds)) return holds;

      entries.push({ at, holds });
    }
  }

  return entries.length === 0 ? say('intent.nothing-on-that-line') : entries;
}

/** The answer that writes every address as a cell of its own, the formulas moved with them. */
function onCells(
  spec: Projection,
  sheet: CompiledSheet,
  where: Filling,
  read: Reading,
): Candidate | null {
  const entries = going(sheet, where);
  if (sentence(entries)) return null;

  const held: Held[] = [];
  const put = landed(spec, sheet, where.sheet, entries, read, {
    doing: 'refuse',
    refusals: held,
    verb: 'filled',
    nothing: 'nothing in this rectangle can be filled from the line above it',
  });
  if (sentence(put)) return null;

  const files = [...put.ops.keys()];
  const file = files[0];
  if (file === undefined || files.length > 1) return null;

  return {
    id: 'onCells',
    what: say('intent.write-cells-of-their-own', { many: entries.length }),
    moves: entries.map((one) => ({ sheet: where.sheet, at: one.at })),
    alone: false,
    intent: {
      kind: 'edit',
      file,
      patch: { ops: put.ops.get(file) ?? [] },
      expects: { cells: put.cells, beyond: 'ask' },
    },
  };
}

/** One `formulas:` range, where the line holds formulas and nothing is written under it (§3). */
function asRange(sheet: CompiledSheet, where: Filling, read: Reading): Candidate | null {
  const down = where.axis === 'row';
  const from = down ? where.rect.top : where.rect.left;
  const across = down
    ? { first: where.rect.left, last: where.rect.right }
    : { first: where.rect.top, last: where.rect.bottom };

  const ranges: string[] = [];
  const moves: { sheet: SheetName; at: A1Addr }[] = [];

  for (let one = across.first; one <= across.last; one += 1) {
    const source = down ? addrAt({ col: one, row: from }) : addrAt({ col: from, row: one });
    const cell = cellAt(sheet, source);
    if (cell === null || cell.formula === null) return null;
    if (cell.provenance.value.kind !== 'literal') return null;

    const rect = down
      ? { top: from, left: one, bottom: where.rect.bottom, right: one }
      : { top: one, left: from, bottom: one, right: where.rect.right };
    if (written(sheet, rect)) return null;

    ranges.push(`at: ${rangeOf(rect)}\nformula: ${quoted(cell.formula)}`);
    for (const at of addressesOf(rect)) moves.push({ sheet: where.sheet, at });
  }

  const found = located(sheet.node, read);
  if (found.kind === 'refused' || ranges.length === 0) return null;

  // Not an answer at all where the ranges are another file's: an answer offered
  // is one this editor can make.
  if (keptElsewhere(found.node, KEY.formulas, where.sheet) !== null) return null;

  return {
    id: 'range',
    what: say('intent.write-as-ranges', { many: ranges.length, axis: where.axis }),
    moves,
    alone: false,
    intent: {
      kind: 'edit',
      file: found.file,
      patch: { ops: putEntries(sequenceIn(found, KEY.formulas), ranges) },
      expects: {
        cells: new Set(moves.map((one) => qualified(one.sheet, one.at))),
        beyond: 'ask',
      },
    },
  };
}

/** Whether anything in the rectangle but its first cell is already written, which a range may not cross. */
function written(sheet: CompiledSheet, rect: Rect): boolean {
  return addressesOf(rect)
    .slice(1)
    .some((at) => cellAt(sheet, at) !== null);
}

function quoted(formula: string): string {
  return `"${formula.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
