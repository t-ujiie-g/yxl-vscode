import type {
  DataRow,
  FooterCell,
  FooterEntry,
  FooterRow,
  Layout,
  ScalarValue,
  SpecNode,
} from '@yxl-vscode/spec';
import { type A1Addr, addrAt, type Rect } from '@yxl-vscode/units';
import { compileFacets } from './cell';
import { CODE } from './codes';
import { type Ctx, reject } from './ctx';
import type { CompiledCell } from './grid';
import { type Column, colOf, type FooterLine, type Placed } from './placed';
import { blankAt, origin, refs, substitute } from './refs';
import { layersOf, type StyleLayer } from './style';
import { say } from './text';

interface Scope {
  readonly ctx: Ctx;
  readonly layout: Layout;
  readonly columns: readonly Column[];
  readonly inputs: readonly Column[];
  readonly data: readonly DataRow[];
}

/** Footer entries from `row` down, a group once per value among `members`; the row after, or `null`. */
export function lines(
  scope: Scope,
  entries: readonly FooterEntry[],
  keys: readonly (readonly [string, ScalarValue])[],
  members: readonly number[],
  row: number,
  into: FooterLine[],
): number | null {
  const { ctx } = scope;
  let next = row;

  for (const entry of entries) {
    if (entry.kind === 'row') {
      if (!rowFits(scope, entry)) return null;
      into.push({ row: next, entry, keys });
      next += 1;
      continue;
    }

    const field = scope.inputs.findIndex((one) => one.name === entry.by);
    if (field < 0) {
      reject(
        ctx,
        CODE.unknownColumn,
        say('compile.not-an-input-column', { name: entry.by }),
        entry,
      );
      return null;
    }
    if (keys.some(([name]) => name === entry.by)) {
      reject(ctx, CODE.badLayout, say('compile.group-inside-itself', { name: entry.by }), entry);
      return null;
    }
    if (scope.layout.source === null && entry.order.kind !== 'listed') {
      reject(ctx, CODE.badLayout, say('compile.group-needs-data', { name: entry.by }), entry);
      return null;
    }

    const fieldAt = (index: number): ScalarValue => scope.data[index]?.[field] ?? null;
    const values = groupValues(ctx, entry, members.map(fieldAt));
    if (values === null) return null;

    for (const value of values) {
      const inside = members.filter((index) => fieldAt(index) === value);
      const after = lines(scope, entry.rows, [...keys, [entry.by, value]], inside, next, into);
      if (after === null) return null;
      next = after;
    }
  }
  return next;
}

/** A group's values in `order`: as the data lists them, sorted, or as listed — which must hold them all. */
function groupValues(
  ctx: Ctx,
  group: Extract<FooterEntry, { kind: 'group' }>,
  held: readonly ScalarValue[],
): ScalarValue[] | null {
  const present = [...new Set(held)];
  const order = group.order;

  if (order.kind !== 'listed') {
    if (order.kind === 'asc') return present.sort(compareGroups);
    if (order.kind === 'desc') return present.sort((one, other) => compareGroups(other, one));
    return present;
  }

  const listed = new Set<ScalarValue>();
  for (const value of order.values) {
    if (listed.has(value)) {
      reject(ctx, CODE.badLayout, say('compile.order-lists-twice', { value: label(value) }), group);
      return null;
    }
    listed.add(value);
  }

  const missing = present.find((value) => !listed.has(value));
  if (missing !== undefined) {
    reject(ctx, CODE.badLayout, say('compile.order-leaves-out', { value: label(missing) }), group);
    return null;
  }
  return [...order.values];
}

/** Numbers, then text — shorter first, as yxl sorts it rather than as §25 says — then the rest, a blank last. */
function compareGroups(one: ScalarValue, other: ScalarValue): number {
  if (typeof one === 'number' && typeof other === 'number') return one - other;
  if (typeof one === 'string' && typeof other === 'string') {
    if (one.length !== other.length) return one.length - other.length;
    return one < other ? -1 : one > other ? 1 : 0;
  }
  return rank(one) - rank(other);
}

function rank(value: ScalarValue): number {
  if (typeof value === 'number') return 0;
  if (typeof value === 'string') return 1;
  return value === null ? 3 : 2;
}

/** A group value as a label spells it: a whole number without a decimal point, a blank as nothing. */
function label(value: ScalarValue): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' && Number.isInteger(value) && Math.abs(value) < 1e15) {
    return value.toFixed(0);
  }
  return String(value);
}

/** Whether every cell a footer row writes names a column, and every `merge_to` spans rightward over nothing written. */
function rowFits(scope: Scope, row: FooterRow): boolean {
  const { ctx } = scope;
  for (const cell of row.cells) {
    const first = colOf(scope, cell.column);
    if (first === undefined) {
      reject(ctx, CODE.unknownColumn, say('compile.no-such-column', { name: cell.column }), cell);
      return false;
    }
    if (cell.mergeTo === null) continue;

    const last = colOf(scope, cell.mergeTo);
    if (last === undefined) {
      reject(ctx, CODE.unknownColumn, say('compile.no-such-column', { name: cell.mergeTo }), cell);
      return false;
    }
    if (last <= first) {
      const message = say('compile.merges-leftward', { name: cell.column, to: cell.mergeTo });
      reject(ctx, CODE.badLayout, message, cell);
      return false;
    }

    const over = row.cells.find((one) => {
      const col = colOf(scope, one.column) ?? 0;
      return col > first && col <= last;
    });
    if (over !== undefined) {
      const message = say('compile.merges-over', { name: cell.column, over: over.column });
      reject(ctx, CODE.badLayout, message, cell);
      return false;
    }
  }
  return true;
}

/** One footer row: each cell it names, and a blank in its style under every other column. */
export function drawFooterRow(
  ctx: Ctx,
  placed: Placed,
  line: FooterLine,
  cells: CompiledCell[],
  merge: (rect: Rect) => void,
): void {
  const { entry, row } = line;
  const worn = layersOf(ctx, entry, 'cell', entry.style, null);
  let coveredTo = 0;
  let cover: readonly StyleLayer[] = [];

  for (const column of placed.columns) {
    const at = addrAt({ col: column.col, row });
    if (column.col <= coveredTo) {
      if (cover.length > 0) cells.push(blankAt(at, cover, origin(entry, placed.layout)));
      continue;
    }

    const cell = entry.cells.find((one) => one.column === column.name);
    if (cell === undefined) {
      if (worn.length > 0) cells.push(blankAt(at, worn, origin(entry, placed.layout)));
      continue;
    }

    const written = footerCell(ctx, placed, cell, line, at, worn);
    if (written === null) continue;
    cells.push(written);

    if (cell.mergeTo === null) continue;
    const last = colOf(placed, cell.mergeTo) ?? column.col;
    merge({ top: row, bottom: row, left: column.col, right: last });
    coveredTo = last;
    cover = written.style;
  }
}

function footerCell(
  ctx: Ctx,
  placed: Placed,
  cell: FooterCell,
  line: FooterLine,
  at: A1Addr,
  worn: readonly StyleLayer[],
): CompiledCell | null {
  const from = origin(cell, placed.layout);

  if (cell.total !== null) {
    const col = colOf(placed, cell.column) ?? 0;
    const formula = total(placed, cell.total, col, line.keys);
    return { ...blankAt(at, worn, from), formula };
  }

  let spelled: FooterCell = cell;
  if (cell.value?.kind === 'literal' && typeof cell.value.value === 'string') {
    const value = groupText(ctx, cell, cell.value.value, line.keys);
    if (value === null) return null;
    spelled = { ...spelled, value: { kind: 'literal', value } };
  }
  if (cell.formula?.kind === 'inline') {
    const body = refs(ctx, cell, cell.formula.body, placed, null, line.row);
    if (body === null) return null;
    spelled = { ...spelled, formula: { kind: 'inline', body } };
  }

  const written = compileFacets(ctx, spelled, at, from, 'cell');
  return { ...written, style: [...worn, ...written.style] };
}

/** `{ total: … }` as a formula over the column's body, filtered by every enclosing group (`docs/spec.md` §25). */
function total(
  placed: Placed,
  kind: NonNullable<FooterCell['total']>,
  col: number,
  keys: readonly (readonly [string, ScalarValue])[],
): string {
  const range = (at: number) =>
    `${addrAt({ col: at, row: placed.bodyFirst })}:${addrAt({ col: at, row: placed.bodyLast })}`;
  const body = range(col);
  const criteria = keys
    .map(([name, value]) => {
      const by = colOf(placed, name) ?? col;
      return `,${range(by)},${criterion(value)}`;
    })
    .join('');

  if (keys.length === 0) {
    const plain = { sum: 'SUM', average: 'AVERAGE', min: 'MIN', max: 'MAX', count: 'COUNTA' };
    return `${plain[kind]}(${body})`;
  }
  if (kind === 'count') return `COUNTIFS(${body},"<>"${criteria})`;

  const grouped = { sum: 'SUMIFS', average: 'AVERAGEIFS', min: 'MINIFS', max: 'MAXIFS' };
  return `${grouped[kind]}(${body}${criteria})`;
}

/** A group value as an `…IFS` criterion that matches it and nothing else: text compared with `=`, its wildcards escaped. */
function criterion(value: ScalarValue): string {
  if (typeof value === 'string') {
    const escaped = value.replace(/[~*?]/g, (char) => `~${char}`).replace(/"/g, '""');
    return `"=${escaped}"`;
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return label(value);
  return '""';
}

/** A footer label with each `{{name}}` spelled as the value of the enclosing group on `name`. */
function groupText(
  ctx: Ctx,
  node: SpecNode,
  written: string,
  keys: readonly (readonly [string, ScalarValue])[],
): string | null {
  return substitute(ctx, node, written, false, (name) => {
    const key = keys.find(([by]) => by === name);
    if (key !== undefined) return label(key[1]);

    reject(ctx, CODE.badLayout, say('compile.text-spells-no-group', { name }), node);
    return null;
  });
}
