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
 * Every cell one node of the spec reaches — a definition, a band, a `data:`
 * block, a cell of its own.
 *
 * This is what a resolution dialog counts ("ripples to 40 cells") and what
 * `verify` takes as the expected diff of a definition edit: a change
 * that touches a cell this did not name is the surprise that gate exists for.
 *
 * It answers for the cells the projection **holds**, and for the cells a
 * `formulas:` range covers — those are held as a range rather than as cells
 * (ADR-019), and a range that reached nothing would be the one construct whose
 * reach a reader most wants to see. A band still reaches every empty address in
 * its span and cannot say so: no diff of two projections could show it, because
 * neither side has a cell there.
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

/**
 * The addresses of a range, as far as the projection would draw them.
 *
 * `at: D2:D1048576` is two words in a spec; the count a reader is shown has to
 * be a number they can act on rather than the height of a sheet.
 */
function covered(sheet: CompiledSheet, fill: CompiledFill): A1Addr[] {
  const held: A1Addr[] = [];
  let rows = 0;

  // Down to where the sheet writes something, and across the range's own
  // columns: a range's columns are what the spec spelled out, and its rows are
  // where the cells it reads run out.
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
