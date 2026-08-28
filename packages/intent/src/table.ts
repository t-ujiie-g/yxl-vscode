import { type CompiledSheet, cellAt, sheetOf } from '@yxl-vscode/compile';
import { type Node, nodeAt, type Op } from '@yxl-vscode/cst';
import { KEY } from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  type FilePath,
  qualified,
  type Rect,
  type SheetName,
} from '@yxl-vscode/units';
import { putEntries, sequenceIn } from './anchored';
import {
  type Intent,
  keptElsewhere,
  located,
  type Projection,
  type Reading,
  refused,
} from './direct';

/** A rectangle of `cells:` entries a reader asked to keep as a table instead. */
export interface Tabling {
  readonly sheet: SheetName;
  readonly rect: Rect;
}

/**
 * A rectangle of plain `cells:` entries written again as one anchored `data:`
 * block (`docs/spec.md` §9): the addresses go into `at:` once, so a row
 * inserted below is a one-line diff rather than a rewritten key per cell.
 */
export function asTable(spec: Projection, where: Tabling, read: Reading): Intent {
  const sheet = sheetOf(spec.grid, where.sheet);
  if (sheet === null) return refused(`there is no sheet named \`${where.sheet}\``);
  if (where.rect.bottom - where.rect.top < 1) {
    return refused('a table is more than one row, so there is nothing here to anchor');
  }

  const held = taken(sheet, where.rect, read);
  if (typeof held === 'string') return refused(held);

  const file = held.file;
  const rows = held.rows.map((row) => `  - [${row.join(', ')}]`).join('\n');
  const body = `at: ${addrAt({ col: where.rect.left, row: where.rect.top })}\nvalues:\n${rows}`;

  const sheetAt = located(sheet.node, read);
  if (sheetAt.kind === 'refused') return sheetAt;

  // The cells come out and the block goes in, so both keys have to be this
  // file's: the rows are read from where the cells are written.
  const away =
    keptElsewhere(sheetAt.node, KEY.cells, where.sheet) ??
    keptElsewhere(sheetAt.node, KEY.data, where.sheet);
  if (away !== null) return refused(away);

  // The key goes where the table takes every entry under it; a mapping with no
  // entries left is not a mapping at all.
  const written: Op[] = [
    ...(emptied(sheetAt.node, held.entries.length)
      ? [{ op: 'remove' as const, path: [...sheetAt.path, KEY.cells] }]
      : held.entries.map((path) => ({ op: 'remove' as const, path }))),
    ...putEntries(sequenceIn(sheetAt, KEY.data), [body]),
  ];

  return {
    kind: 'edit',
    file,
    patch: { ops: written },
    expects: { cells: new Set(held.moves.map((at) => qualified(where.sheet, at))), beyond: 'ask' },
  };
}

/** Whether taking that many entries out of the sheet's `cells:` leaves none there. */
function emptied(node: Node, many: number): boolean {
  const cells = nodeAt(node, [KEY.cells]);
  return cells?.kind === 'map' && cells.entries.length === many;
}

interface Taken {
  readonly file: FilePath;
  readonly rows: readonly (readonly string[])[];
  readonly entries: readonly (readonly (string | number)[])[];
  readonly moves: readonly A1Addr[];
}

/** Every cell of the rectangle as the file writes it, or why one of them cannot go into a table. */
function taken(sheet: CompiledSheet, rect: Rect, read: Reading): Taken | string {
  const rows: string[][] = [];
  const entries: (string | number)[][] = [];
  const moves: A1Addr[] = [];
  let file: FilePath | null = null;

  for (let row = rect.top; row <= rect.bottom; row += 1) {
    const fields: string[] = [];

    for (let col = rect.left; col <= rect.right; col += 1) {
      const at = addrAt({ col, row });
      const cell = cellAt(sheet, at);
      if (cell === null) {
        fields.push('null');
        continue;
      }

      const from = cell.provenance.value;
      if (from.kind !== 'literal') {
        return `\`${at}\` is not written as a cell of its own, so a table cannot take it over`;
      }

      const found = located(from.node, read);
      if (found.kind === 'refused') return found.why;
      if (found.node.kind !== 'scalar') {
        return `\`${at}\` says more than a value, which a table has nowhere to keep`;
      }

      const source = read.text(found.file);
      if (source === null) return `\`${found.file}\` could not be read`;
      if (file !== null && file !== found.file) {
        return 'these cells are written in more than one file, which this cannot gather at once';
      }

      file = found.file;
      fields.push(source.slice(found.node.span.start, found.node.span.end));
      entries.push([...found.path]);
      moves.push(at);
    }

    rows.push(fields);
  }

  if (file === null) return 'nothing here is written as a cell, so there is no table to make';

  return { file, rows, entries, moves };
}
