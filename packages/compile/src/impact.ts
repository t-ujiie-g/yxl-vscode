import { type A1Addr, addrAt, cellOf, type NodeId } from '@yxl-vscode/units';
import { styleAt } from './compile';
import type { CompiledCell, CompiledFill, CompiledGrid, CompiledSheet } from './grid';
import type { FacetOrigin } from './provenance';

/** A cell named together with the sheet it is on, which is how a ripple reads. */
export interface FullAddr {
  readonly sheet: string;
  readonly at: A1Addr;
}

/**
 * Every cell one node of the spec reaches, over the cells the projection holds
 * and the ones a `formulas:` range covers. A band's reach into empty addresses
 * cannot be said, since no cell is there to name.
 */
export function reaches(grid: CompiledGrid, node: NodeId): readonly FullAddr[] {
  const found: FullAddr[] = [];

  for (const sheet of grid.sheets) {
    for (const cell of sheet.cells.values()) {
      if (touches(sheet, cell, node)) found.push({ sheet: sheet.name, at: cell.at });
    }

    for (const fill of sheet.fills) {
      if (fill.node !== node) continue;
      for (const at of covered(sheet, fill)) found.push({ sheet: sheet.name, at });
    }
  }

  return found;
}

/** The addresses of a range, down to where the sheet writes something: `D2:D1048576` is not a count. */
function covered(sheet: CompiledSheet, fill: CompiledFill): A1Addr[] {
  const held: A1Addr[] = [];
  let rows = 0;

  for (const cell of sheet.cells.values()) rows = Math.max(rows, cellOf(cell.at).row);

  for (let row = fill.rect.top; row <= Math.min(fill.rect.bottom, rows); row += 1) {
    for (let col = fill.rect.left; col <= fill.rect.right; col += 1) {
      const at = addrAt({ col, row });
      if (!sheet.cells.has(at)) held.push(at);
    }
  }

  return held;
}

function touches(sheet: CompiledSheet, cell: CompiledCell, node: NodeId): boolean {
  if (names(cell.provenance.value, node)) return true;
  if (cell.provenance.format !== null && names(cell.provenance.format, node)) return true;

  return styleAt(sheet, cell.at).some((layer) => layer.node === node);
}

/** Whether an origin names the node, as the node it sits at or as what it points to. */
function names(origin: FacetOrigin, node: NodeId): boolean {
  if (origin.kind === 'empty') return origin.node === node;
  if (origin.kind === 'defRef' && origin.def === node) return true;
  if (origin.kind === 'param' && origin.declared.includes(node)) return true;

  return origin.node === node;
}
