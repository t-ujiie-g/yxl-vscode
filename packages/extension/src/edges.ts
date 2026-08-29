import { type CompiledSheet, cellAt } from '@yxl-vscode/compile';
import { type A1Addr, addrAt, type CellRef, cellOf } from '@yxl-vscode/units';

/** How far a `Cmd`+arrow steps, and in which direction; one of the two is always zero. */
export interface Step {
  readonly rows: number;
  readonly cols: number;
}

/**
 * Where a `Cmd`+arrow lands: the far end of a run, across a gap to the next
 * thing, or the sheet's own edge. The host answers because the view holds a
 * window and a block runs past the end of one (ADR-019).
 */
export function edgeFrom(
  sheet: CompiledSheet,
  of: { rows: number; columns: number },
  from: A1Addr,
  by: Step,
): A1Addr {
  const holds = (at: CellRef): boolean => cellAt(sheet, addrAt(at)) !== null;
  const next = (at: CellRef): CellRef => ({ row: at.row + by.rows, col: at.col + by.cols });
  const inside = (at: CellRef): boolean =>
    at.row >= 1 && at.col >= 1 && at.row <= of.rows && at.col <= of.columns;

  let here = cellOf(from);
  if (!inside(next(here))) return from;

  const running = holds(next(here));
  while (inside(next(here)) && holds(next(here)) === running) here = next(here);

  return addrAt(running ? here : inside(next(here)) ? next(here) : here);
}
