import type { A1Addr, NodeId } from '@yxl-vscode/units';
import { styleAt } from './compile';
import type { CompiledCell, CompiledGrid, CompiledSheet } from './grid';
import type { FacetOrigin } from './provenance';

/** A cell named together with the sheet it is on, which is how a ripple reads. */
export interface FullAddr {
  readonly sheet: string;
  readonly at: A1Addr;
}

/**
 * Every cell one node of the spec reaches — a definition, a band, a `data:`
 * block, a cell of its own.
 *
 * This is what a resolution dialog counts ("ripples to 40 cells") and what
 * `verify` takes as the expected diff of a definition edit: a change
 * that touches a cell this did not name is the surprise that gate exists for.
 *
 * It answers for the cells the projection **holds**. A band also reaches every
 * empty address in its span, and no diff of two projections could show that,
 * because neither side has a cell there — the band itself is the honest way to
 * say "and the rest of column B".
 */
export function reaches(grid: CompiledGrid, node: NodeId): readonly FullAddr[] {
  const found: FullAddr[] = [];

  for (const sheet of grid.sheets) {
    for (const cell of sheet.cells.values()) {
      if (touches(sheet, cell, node)) found.push({ sheet: sheet.name, at: cell.at });
    }
  }

  return found;
}

function touches(sheet: CompiledSheet, cell: CompiledCell, node: NodeId): boolean {
  if (names(cell.provenance.value, node)) return true;
  if (cell.provenance.format !== null && names(cell.provenance.format, node)) return true;

  return styleAt(sheet, cell.at).some((layer) => layer.node === node);
}

/** Whether an origin names the node, as the node it sits at or as what it points to. */
function names(origin: FacetOrigin, node: NodeId): boolean {
  if (origin.kind === 'empty') return false;
  return origin.node === node || (origin.kind === 'defRef' && origin.def === node);
}
