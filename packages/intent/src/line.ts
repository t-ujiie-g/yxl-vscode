import {
  addressesIn,
  type CompiledSheet,
  type FullAddr,
  REACH,
  sheetOf,
} from '@yxl-vscode/compile';
import { nodeAt, type Op, type Path } from '@yxl-vscode/cst';
import {
  type A1Addr,
  addrAt,
  cellOf,
  type FilePath,
  type Line,
  qualified,
  type Rect,
  rangeOf,
  type SheetName,
  shifted,
} from '@yxl-vscode/units';
import { spelled } from './bands';
import { type Found, type Intent, located, type Projection, type Reading, refused } from './direct';
import type { Candidate } from './resolve';
import { along, blocks, lineSaid, shifting } from './shift';

/**
 * A row or a column inserted, or taken away: every construct the line reaches
 * moved where the line leaves it (§4.4). Nothing is written where anything
 * stands in the way — the reasons are `shifting`'s, worked out first.
 */
export function drawLine(spec: Projection, line: Line, read: Reading): Intent {
  const sheet = sheetOf(spec.grid, line.sheet);
  if (sheet === null) return refused(`there is no sheet named \`${line.sheet}\``);
  if (line.at < 1) return refused(`there is no ${line.axis} ${line.at}`);

  const stopped = shifting(sheet, line).stops[0];
  if (stopped !== undefined) return refused(stopped);

  const written = writing(sheet, line, read);
  if (written.kind !== 'writing') return written;

  return {
    kind: 'edit',
    file: written.file,
    patch: { ops: written.ops },
    expects: {
      cells: new Set(written.moves.map((at) => qualified(sheet.name, at))),
      beyond: 'ask',
    },
  };
}

/** How much a line may move before a reader is asked first, rather than told after. */
const MANY = 20;

/**
 * The one answer a line has, with what it costs in front of it: applied without
 * asking where it moves little, and offered where the count is what a reader is
 * deciding about (§4.4).
 */
export function setLine(spec: Projection, line: Line, read: Reading): readonly Candidate[] {
  const sheet = sheetOf(spec.grid, line.sheet);
  if (sheet === null) return [];

  // The one answer, whatever the intent turns out to be: a refusal carries its
  // own reason, and swallowing it here would leave the reader with none.
  const intent = drawLine(spec, line, read);
  const { moves } = shifting(sheet, line);
  const keys = moves.filter((one) => one.of === 'cell').length;

  return [
    {
      id: 'line',
      what: `${said(line)}, moving ${counted(moves.length, keys)}`,
      moves: intent.kind === 'edit' ? [...intent.expects.cells].map(named) : [],
      alone: moves.length <= MANY,
      intent,
    },
  ];
}

/** What the gesture is, as the reader asked for it. */
function said(line: Line): string {
  const many = Math.abs(line.by);
  const what = many === 1 ? line.axis : `${many} ${line.axis}s`;

  return line.by < 0 ? `Take ${lineSaid(line)} away` : `Put ${what} in above ${lineSaid(line)}`;
}

/** What it costs, in the lines of YAML it would touch and the cell keys among them. */
function counted(all: number, keys: number): string {
  const things = `${all} thing${all === 1 ? '' : 's'}`;
  if (keys === 0) return things;

  return `${things}, ${keys === all ? 'all' : keys} of them \`cells:\` keys`;
}

/** One qualified address back into the sheet and cell it names. */
function named(one: string): FullAddr {
  const [sheet = '', at = ''] = one.split('!');
  return { sheet: sheet as SheetName, at: at as A1Addr };
}

interface Writing {
  readonly kind: 'writing';
  readonly file: FilePath;
  readonly ops: readonly Op[];
  readonly moves: readonly A1Addr[];
}

function writing(sheet: CompiledSheet, line: Line, read: Reading): Writing | Intent {
  const of = along(line);
  const ops = new Map<FilePath, Op[]>();
  const moves: A1Addr[] = [];

  const put = (found: ReturnType<typeof located>, made: (path: Path) => readonly Op[]): boolean => {
    if (found.kind === 'refused') return false;

    ops.set(found.file, [...(ops.get(found.file) ?? []), ...made(found.path)]);
    return true;
  };

  // What the edit claims: every address the line reaches, and the one it leaves
  // each of them at — a cell that moved changed in both places.
  for (const at of addressesIn(sheet, REACH)) {
    const does = of.at(cellOf(at));
    if (does === null) continue;

    moves.push(at);
    if (does !== 'goes') moves.push(moved(at, line));
  }

  for (const [key, cell] of sheet.cells) {
    const at = key as A1Addr;
    const from = cell.provenance.value;
    if (from.kind !== 'literal') continue;

    const does = of.at(cellOf(at));
    const gone = does === 'goes';
    if (does !== null) {
      put(located(from.node, read), (path) =>
        gone ? [{ op: 'remove', path }] : [{ op: 'renameKey', path, to: moved(at, line) }],
      );
    }

    // A formula says the same thing from where it stands, whether or not the
    // line moved the cell it is written in.
    if (gone || cell.formula === null) continue;

    const now = shifted(cell.formula, sheet.name, line);
    if (now.ok && now.formula !== cell.formula) {
      put(located(from.node, read), (path) => [
        { op: 'set', path: [...path, 'formula'], value: now.formula },
      ]);
    }
  }

  for (const block of blocks(sheet)) {
    const does = of.over(block.rect);
    if (does === null) continue;

    const found = located(block.node, read);
    if (does === 'goes') {
      put(found, (path) => [{ op: 'remove', path }]);
      continue;
    }
    if (does === 'shifts') {
      put(found, (path) => [{ op: 'set', path: [...path, 'at'], value: corner(block.rect, line) }]);
      continue;
    }

    const why = flowing(found, line);
    if (why !== null) return refused(why);

    put(found, (path) => opened(block.rect, line, path));
  }

  for (const fill of sheet.fills) {
    const does = of.over(fill.rect);
    if (does === null) continue;

    const found = located(fill.node, read);
    if (does === 'goes') {
      put(found, (path) => [{ op: 'remove', path }]);
      continue;
    }

    const rect = grown(fill.rect, line, does);
    const now = shifted(fill.formula, sheet.name, line);
    put(found, (path) => [
      { op: 'set', path: [...path, 'at'], value: rangeOf(rect) },
      ...(now.ok && now.formula !== fill.formula
        ? [{ op: 'set', path: [...path, 'formula'], value: now.formula } as const]
        : []),
    ]);
  }

  for (const merge of sheet.merges) {
    const does = of.over(merge.rect);
    if (does === null) continue;

    put(located(merge.node, read), (path) =>
      does === 'goes'
        ? [{ op: 'remove', path }]
        : [{ op: 'set', path, value: rangeOf(grown(merge.rect, line, does)) }],
    );
  }

  for (const band of line.axis === 'column' ? sheet.columns : sheet.rows) {
    const does = of.run(band.first, band.last);
    if (does === null) continue;

    const run = held(band.first, band.last, line, does);
    // A row band's `at:` is a number where it names one row, and the file said
    // it that way (`docs/spec.md` §4).
    const one = line.axis === 'row' && run.first === run.last;
    put(located(band.node, read), (path) =>
      does === 'goes'
        ? [{ op: 'remove', path }]
        : [
            {
              op: 'set',
              path: [...path, 'at'],
              value: one ? run.first : spelled({ axis: line.axis, ...run }),
            },
          ],
    );
  }

  if (sheet.freeze !== null && of.at(cellOf(sheet.freeze)) !== null) {
    const at = sheet.freeze;
    const does = of.at(cellOf(at));
    put(located(sheet.node, read), (path) =>
      does === 'goes'
        ? [{ op: 'remove', path: [...path, 'freeze'] }]
        : [{ op: 'set', path: [...path, 'freeze'], value: moved(at, line) }],
    );
  }

  const files = [...ops.keys()];
  const file = files[0];
  if (file === undefined) return refused(`nothing here moves when ${lineSaid(line)} is drawn`);
  if (files.length > 1) {
    return refused(`${lineSaid(line)} reaches more than one file, which this cannot write at once`);
  }

  return { kind: 'writing', file, ops: ops.get(file) ?? [], moves };
}

/** Why more than one column cannot come out of this block at once: its rows are `[a, b]`. */
function flowing(found: Found, line: Line): string | null {
  if (line.axis !== 'column' || found.kind === 'refused' || line.by > -2) return null;

  const values = nodeAt(found.node, ['values']);
  const first = values?.kind === 'seq' ? values.items[0] : undefined;
  if (first === undefined || first.kind === 'scalar' || !first.flow) return null;

  return 'rows written as `[a, b]` give up one field at a time, so take these away one by one';
}

/** One address once the line is drawn. */
function moved(at: A1Addr, line: Line): A1Addr {
  const cell = cellOf(at);
  const one = line.axis === 'column' ? cell.col : cell.row;

  return line.axis === 'column'
    ? addrAt({ col: one + line.by, row: cell.row })
    : addrAt({ col: cell.col, row: one + line.by });
}

/** The top-left of a rectangle that moves whole. */
function corner(rect: Rect, line: Line): string {
  return moved(addrAt({ col: rect.left, row: rect.top }), line);
}

/** A rectangle with the line taken in: the far end moves, the near one stays. */
function grown(rect: Rect, line: Line, does: string): Rect {
  const near = line.axis === 'column' ? rect.left : rect.top;
  const far = line.axis === 'column' ? rect.right : rect.bottom;
  const run = held(near, far, line, does);

  return line.axis === 'column'
    ? { ...rect, left: run.first, right: run.last }
    : { ...rect, top: run.first, bottom: run.last };
}

/** A run of the axis once the line is drawn: it moves whole, or it takes the line in. */
function held(
  first: number,
  last: number,
  line: Line,
  does: string,
): { first: number; last: number } {
  if (does === 'shifts') return { first: first + line.by, last: last + line.by };

  const gone =
    line.by < 0 ? Math.min(last, line.at - line.by - 1) - Math.max(first, line.at) + 1 : 0;

  return { first, last: line.by < 0 ? last - gone : last + line.by };
}

/** The gap a line opens inside an inline `data:` block, or the row it takes out of one. */
function opened(rect: Rect, line: Line, path: Path): readonly Op[] {
  const values: Path = [...path, 'values'];
  const rows = rect.bottom - rect.top;
  const near = line.axis === 'column' ? rect.left : rect.top;
  const first = Math.max(line.at - near, 0);

  if (line.axis === 'row') {
    const many = line.by < 0 ? Math.min(-line.by, rows + 1 - first) : line.by;
    return line.by < 0
      ? Array.from({ length: many }, (_, one) => ({ op: 'remove', path: [...values, first + one] }))
      : Array.from({ length: many }, () => ({
          op: 'insertSource',
          path: values,
          index: first,
          source: '[]',
        }));
  }

  const many = line.by < 0 ? -line.by : line.by;
  return Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: many }, () =>
      line.by < 0
        ? ({ op: 'remove', path: [...values, row, first] } as const)
        : ({ op: 'insert', path: [...values, row], index: first, value: null } as const),
    ),
  ).flat();
}
