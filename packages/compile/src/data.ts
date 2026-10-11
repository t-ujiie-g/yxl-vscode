import type { DataBlock, DataRow } from '@yxl-vscode/spec';
import { type A1Addr, addrAt, cellOf, type FilePath, type SheetName } from '@yxl-vscode/units';
import { layer, type Spoke } from './cell';
import { CODE } from './codes';
import { type Ctx, filled, openData, reject } from './ctx';
import type { CompiledBlock, CompiledCell } from './grid';
import { anchored } from './named';
import type { FacetOrigin } from './provenance';
import { readCsv, readJson } from './table';
import { say } from './text';

/** A field of a data block speaks of what the cell holds and of nothing else (`docs/spec.md` §9). */
const HOLDS: Spoke = { holds: true, format: false, style: false };

/** A `data:` block's rows laid down from its anchor; a `null` field writes no cell (`docs/spec.md` §9). */
export function placeData(
  ctx: Ctx,
  block: DataBlock,
  cells: Map<string, CompiledCell>,
  sheet: SheetName,
): CompiledBlock | null {
  const anchor = anchored(ctx, block.at, block, sheet);
  if (anchor === null) return null;

  if (block.source.kind === 'inline') {
    const rows = block.source.rows.map((row) =>
      row.map((field) => filled(ctx, field, block).value),
    );
    place(cells, anchor, rows, (row, col) => ({ kind: 'inline', node: block.id, row, col }));
    return reach(anchor, rows, block, null);
  }

  const opened = readTable(ctx, block, block.source);
  if (opened === null) return null;

  const { file, rows } = opened;
  place(cells, anchor, rows, (row, col) => ({ kind: 'external', node: block.id, file, row, col }));
  return reach(anchor, rows, block, file);
}

/** The rectangle a block's rows cover from its anchor, `null` where it has no field at all. */
function reach(
  anchor: A1Addr,
  rows: readonly DataRow[],
  block: DataBlock,
  file: FilePath | null,
): CompiledBlock | null {
  const wide = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length === 0 || wide === 0) return null;

  const { col, row } = cellOf(anchor);
  const rect = { top: row, left: col, bottom: row + rows.length - 1, right: col + wide - 1 };
  return { rect, node: block.id, file };
}

/** The rows a block names, read through the injected reader (ADR-004) against the opened spec (`docs/spec.md` §9). */
function readTable(
  ctx: Ctx,
  block: DataBlock,
  source: Exclude<DataBlock['source'], { kind: 'inline' }>,
): { file: FilePath; rows: readonly DataRow[] } | null {
  const opened = openData(ctx, source.path, block);
  if (opened === null) return null;

  const columns = source.kind === 'json' ? source.columns : null;
  const table = source.kind === 'csv' ? readCsv(opened.source) : readJson(opened.source, columns);
  if ('problem' in table) {
    reject(
      ctx,
      CODE.badTable,
      say('compile.bad-table', { file: opened.file, problem: table.problem }),
      block,
    );
    return null;
  }

  return { file: opened.file, rows: table.rows };
}

/** Rows laid down from an anchor, each field taking its origin from where it came from. */
function place(
  cells: Map<string, CompiledCell>,
  anchor: A1Addr,
  rows: readonly DataRow[],
  origin: (row: number, col: number) => FacetOrigin,
): void {
  const corner = cellOf(anchor);

  for (const [row, fields] of rows.entries()) {
    for (const [col, field] of fields.entries()) {
      if (field === null) continue;

      const at = addrAt({ col: corner.col + col, row: corner.row + row });
      const written: CompiledCell = {
        at,
        value: field,
        type: null,
        formula: null,
        format: null,
        rich: null,
        style: [],
        provenance: { value: origin(row, col), format: null },
      };

      const under = cells.get(at);
      cells.set(at, under === undefined ? written : layer(under, written, HOLDS));
    }
  }
}
