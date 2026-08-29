import { type CompiledSheet, cellAt } from '@yxl-vscode/compile';
import { type A1Addr, addrAt, type CellRef, cellOf } from '@yxl-vscode/units';
import type { Far } from '@yxl-vscode/webview/protocol';

/**
 * Where a far end is: the end of a block in a direction, the last cell of the
 * row, or the last of the sheet. The host answers because the view holds a
 * window and a sheet runs past the end of one (ADR-019).
 */
export function edgeFrom(
  sheet: CompiledSheet,
  of: { rows: number; columns: number },
  from: A1Addr,
  to: Far,
): A1Addr {
  const here = cellOf(from);
  if (to.kind === 'row') return addrAt({ row: here.row, col: lastIn(sheet, of, here.row) });
  if (to.kind === 'sheet') return lastCell(sheet);

  return blockFrom(sheet, of, here, to);
}

/** The far end of the run under the reader, across a gap to the next thing, or the sheet's own edge. */
function blockFrom(
  sheet: CompiledSheet,
  of: { rows: number; columns: number },
  from: CellRef,
  by: { rows: number; cols: number },
): A1Addr {
  const holds = (at: CellRef): boolean => cellAt(sheet, addrAt(at)) !== null;
  const next = (at: CellRef): CellRef => ({ row: at.row + by.rows, col: at.col + by.cols });
  const inside = (at: CellRef): boolean =>
    at.row >= 1 && at.col >= 1 && at.row <= of.rows && at.col <= of.columns;

  let here = from;
  if (!inside(next(here))) return addrAt(here);

  const running = holds(next(here));
  while (inside(next(here)) && holds(next(here)) === running) here = next(here);

  return addrAt(running ? here : inside(next(here)) ? next(here) : here);
}

/** The last column of this row that holds anything, or the first where none does. */
function lastIn(sheet: CompiledSheet, of: { columns: number }, row: number): number {
  let last = 1;
  for (let col = 1; col <= of.columns; col += 1) {
    if (cellAt(sheet, addrAt({ col, row })) !== null) last = col;
  }

  return last;
}

/** The corner of what the sheet writes, which is where `Cmd`+`End` goes in a spreadsheet. */
function lastCell(sheet: CompiledSheet): A1Addr {
  let row = 1;
  let col = 1;

  for (const cell of sheet.cells.values()) {
    const at = cellOf(cell.at);
    row = Math.max(row, at.row);
    col = Math.max(col, at.col);
  }

  return addrAt({ row, col });
}
