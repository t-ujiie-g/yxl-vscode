import {
  type CompiledCell,
  type CompiledSheet,
  cellAt,
  type FacetOrigin,
} from '@yxl-vscode/compile';
import { type Op, type Path, renderScalar, type Value } from '@yxl-vscode/cst';
import {
  type A1Addr,
  type FilePath,
  moved,
  type Offset,
  qualified,
  type SheetName,
} from '@yxl-vscode/units';
import {
  beside,
  entryOp,
  entryText,
  type Found,
  type Held,
  type Holds,
  literalPath,
  located,
  type Reading,
  type Stood,
  standing,
  stood,
} from './direct';
import { type Excepted, overrides } from './override';
import type { Excepting, Standing } from './paste';
import { detachment } from './resolve';

/** One address a paste lands on, and what is going into it. */
export interface Entry {
  readonly at: A1Addr;
  readonly holds: Holds;
}

/** What a paste comes to: the ops for the file it lands in, and the cells it names. */
export interface Put {
  readonly ops: Map<FilePath, Op[]>;
  readonly cells: Set<string>;
}

/** Every cell of a paste written where it lands; one that cannot take it refuses the whole unless `standing` says otherwise (ADR-032). */
export function landed(
  spec: Excepting,
  to: CompiledSheet,
  sheet: SheetName,
  going: readonly Entry[],
  read: Reading,
  refusals: readonly Held[],
  doing: Standing,
): Put | string {
  const ops = new Map<FilePath, Op[]>();
  const fresh: Entry[] = [];
  const cells = new Set<string>();
  const held = [...refusals];

  const excepting: Entry[] = [];

  for (const one of going) {
    const already = cellAt(to, one.at);
    if (already === null) {
      fresh.push(one);
      cells.add(qualified(sheet, one.at));
      continue;
    }

    const landing = into(to, already.provenance.value, one, read);
    if (typeof landing === 'string') {
      const by = stood(already.provenance.value);
      held.push({ at: one.at, why: landing, by });
      if (by === doing) excepting.push(one);
      continue;
    }

    ops.set(landing.file, [...(ops.get(landing.file) ?? []), ...landing.ops]);
    cells.add(qualified(sheet, one.at));
  }

  if (held.length > 0 && doing === 'refuse') {
    return standing(cells.size - fresh.length, held, 'pasted');
  }

  if (excepting.length > 0 && doing !== 'refuse' && doing !== 'skip') {
    const made = excepted(spec, to, sheet, excepting, doing, read);
    if (typeof made === 'string') return made;

    ops.set(made.file, [...(ops.get(made.file) ?? []), ...made.ops]);
    for (const one of excepting) cells.add(qualified(sheet, one.at));
  }

  if (cells.size === 0) return 'nothing in this rectangle can be pasted here';

  if (fresh.length > 0) {
    const made = entries(to, fresh, read);
    if (typeof made === 'string') return made;

    ops.set(made.file, [...(ops.get(made.file) ?? []), ...made.ops]);
  }

  return { ops, cells };
}

/** What one cell of the rectangle does where it lands: the ops that put it there, or why it cannot go. */
function into(
  sheet: CompiledSheet,
  origin: FacetOrigin,
  one: Entry,
  read: Reading,
): Landed | string {
  const { at, holds } = one;
  const found = literalPath(origin, sheet, at, read);
  if (found.kind === 'refused') return `\`${at}\` cannot be written: ${found.why}`;

  if (origin.kind === 'inline') {
    if ('formula' in holds)
      return `\`${at}\` is a field of a \`data:\` block, which holds no formula`;

    const path = [...found.path, 'values', origin.row, origin.col];
    return { file: found.file, ops: [{ op: 'set', path, value: holds.value }] };
  }

  return { file: found.file, ops: keys(found, holds) };
}

/** The cells of one origin written as the exception it allows: a value of their own, or an override. */
function excepted(
  spec: Excepting,
  to: CompiledSheet,
  sheet: SheetName,
  these: readonly Entry[],
  by: Stood,
  read: Reading,
): Landed | string {
  if (by === 'definition') return detached(to, these, read);

  const said = overrides(spec.doc, spec.grid, sheet, these.map(saying), read);
  if (said.kind === 'refused') return said.why;
  if (said.kind !== 'edit') return 'these cells cannot be written as overrides';

  return { file: said.file, ops: said.patch.ops };
}

/** What an override says for a pasted cell: what the cell holds, and no reason — the reader gave none. */
function saying(one: Entry): Excepted {
  return {
    at: one.at,
    says: 'formula' in one.holds ? { formula: one.holds.formula } : { value: one.holds.value },
  };
}

/** The cells reading a definition, each written as a value of its own; a formula has no such form. */
function detached(to: CompiledSheet, these: readonly Entry[], read: Reading): Landed | string {
  const ops: Op[] = [];
  let file: FilePath | null = null;

  for (const one of these) {
    const origin = cellAt(to, one.at)?.provenance.value;
    if (origin?.kind !== 'defRef') return `\`${one.at}\` no longer reads a definition`;
    if ('formula' in one.holds) {
      return `\`${one.at}\` would take a formula, and a cell that reads a definition takes a value in its place`;
    }

    const taken = detachment(origin, one.holds.value, read);
    if (taken === null) return `\`${one.at}\` has no reference to write over`;
    if (file !== null && file !== taken.file) {
      return `these cells are written across ${beside(file)} and ${beside(taken.file)}, and this editor writes one file at a time`;
    }

    file = taken.file;
    ops.push(taken.op);
  }

  return file === null ? 'there is nothing here to detach' : { file, ops };
}

/** The ops for one file, where a paste lands in exactly one. */
interface Landed {
  readonly file: FilePath;
  readonly ops: readonly Op[];
}

/** The addresses nothing writes yet, as `cells:` entries; the `cells:` key itself can only be written once (ADR-032). */
function entries(sheet: CompiledSheet, fresh: readonly Entry[], read: Reading): Landed | string {
  const found = located(sheet.node, read);
  if (found.kind === 'refused') return `these cells cannot be written: ${found.why}`;
  if (found.node.kind !== 'map') return 'these cells cannot be written: the sheet is not a mapping';

  const has = found.node.entries.some((entry) => entry.key.value === 'cells');
  if (!has) {
    const source = fresh.map((one) => entryText(one.at, one.holds)).join('\n');
    return { file: found.file, ops: [{ op: 'addSource', path: found.path, key: 'cells', source }] };
  }

  // Entries added at one place are spliced from the end of the file, so the
  // last one laid down is the first one read.
  const path = [...found.path, 'cells'];
  const ops = [...fresh].reverse().map((one) => entryOp(path, true, one.at, one.holds));

  return { file: found.file, ops };
}

/** What a cell holds as it would apply where it is going: a formula moves with it (ADR-031). */
export function taking(cell: CompiledCell, by: Offset): Holds | string {
  if (cell.rich !== null) return `\`${cell.at}\` holds rich text, which this editor does not paste`;
  if (cell.formula === null) return { value: cell.value };

  const done = moved(cell.formula, by);
  return done.ok ? { formula: done.formula } : `\`${cell.at}\` holds a formula that ${done.why}`;
}

/** What a cell holds, written into the entry that is already there; what it wears is left alone. */
function keys(found: Found & { kind: 'found' }, holds: Holds): Op[] {
  const key = 'formula' in holds ? 'formula' : 'value';
  const value = ('formula' in holds ? holds.formula : holds.value) as Value;

  if (found.node.kind !== 'map') {
    return key === 'value'
      ? [{ op: 'set', path: found.path, value }]
      : [
          {
            op: 'write',
            path: found.path,
            source: `{ formula: ${renderScalar(value, 'double')} }`,
          },
        ];
  }

  const written = found.node.entries.map((entry) => String(entry.key.value));
  const ops: Op[] = written
    .filter((one) => HOLDS.has(one) && one !== key)
    .map((one) => ({ op: 'remove', path: [...found.path, one] }));

  ops.push(
    written.includes(key)
      ? { op: 'set', path: [...found.path, key], value }
      : entered(found.path, key, holds, written[0] ?? null),
  );

  return ops;
}

/** A key a cell did not have, a value ahead of what it wears and a formula after it. */
function entered(path: Path, key: string, holds: Holds, before: string | null): Op {
  return 'formula' in holds
    ? { op: 'add', path, key, value: holds.formula, before: null }
    : { op: 'add', path, key, value: holds.value, before };
}

/** What a cell holds, against what it wears — the same list emptying a cell works from. */
const HOLDS = new Set(['value', 'formula', 'rich', 'type']);
