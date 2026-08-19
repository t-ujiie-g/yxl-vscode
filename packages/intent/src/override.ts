import { type CompiledGrid, type CompiledSheet, cellAt, sheetOf } from '@yxl-vscode/compile';
import { nodeAt, type Op, renderScalar, type Value } from '@yxl-vscode/cst';
import type { SpecDoc, Templated } from '@yxl-vscode/spec';
import { type A1Addr, type QualifiedAddr, qualified, type SheetName } from '@yxl-vscode/units';
import { type Intent, type Reading, refused } from './direct';

/** The key this all writes into (`docs/spec.md` §23). */
const OVERRIDES = 'overrides';

/** What an override says about one cell, beside where it says it. */
export interface Says {
  readonly value?: Value;
  readonly formula?: string;
  readonly reason?: string;
}

/**
 * Whether a cell can be excepted at all: something has to write it, and it may not
 * be a range's top-left, where the shared formula is stored (`docs/spec.md` §23).
 */
export function overridable(grid: CompiledGrid, where: { sheet: SheetName; at: A1Addr }): boolean {
  const sheet = sheetOf(grid, where.sheet);
  if (sheet === null || cellAt(sheet, where.at) === null) return false;

  return !sheet.fills.some((fill) => fill.anchor === where.at);
}

/**
 * A cell written as an override — the exception said out loud (`docs/spec.md`
 * §23, ADR-007). Never taken on its own, only when a reader asks after being
 * told why the ordinary edit was refused.
 */
export function override(
  doc: SpecDoc,
  grid: CompiledGrid,
  where: { sheet: SheetName; at: A1Addr },
  says: Says,
  read: Reading,
): Intent {
  return overrides(doc, grid, where.sheet, [{ at: where.at, says }], read);
}

/** One cell to be excepted, and what its override says. */
export interface Excepted {
  readonly at: A1Addr;
  readonly says: Says;
}

/**
 * Several cells excepted as one edit, for a rectangle answered a group at a
 * time; the `overrides:` key is written once however many entries go in.
 */
export function overrides(
  doc: SpecDoc,
  grid: CompiledGrid,
  where: SheetName,
  these: readonly Excepted[],
  read: Reading,
): Intent {
  const sheet = sheetOf(grid, where);
  if (sheet === null) return refused(`there is no sheet named \`${where}\``);
  if (these.length === 0) return refused('there is nothing here to except');

  const file = doc.file;
  const tree = read.parsed(file);
  if (tree === null) return refused(`\`${file}\` could not be read`);

  const root = tree.root;
  if (root === null || root.kind !== 'map') {
    return refused('this spec has no document to write an override into');
  }

  const written: string[] = [];
  for (const one of these) {
    const at = { sheet: where, at: one.at };
    if (!overridable(grid, at)) return refused(whyNot(sheet, at));

    // Two overrides for one cell would be two answers, and the compiler takes the last.
    const already = doc.overrides.findIndex(
      (held) => spelled(held.at) === qualified(where, one.at),
    );
    if (already !== -1) {
      return refused(
        `\`${one.at}\` is already overridden — change that override, at \`overrides\` entry ${already + 1}`,
      );
    }

    written.push(lines(at, one.says));
  }

  return {
    kind: 'edit',
    file,
    patch: { ops: writing(written, nodeAt(root, [OVERRIDES]) !== null, doc.overrides.length) },
    expects: {
      cells: new Set(these.map((one) => qualified(where, one.at))),
      beyond: 'ask',
    },
  };
}

/** The entries going in, under the key where the spec has one and with it where it has none. */
function writing(written: readonly string[], held: boolean, at: number): Op[] {
  if (!held) {
    const source = written.map((one) => `- ${indented(one)}`).join('\n');
    return [{ op: 'addSource', path: [], key: OVERRIDES, source }];
  }

  // Entries added at one place are spliced from the end, so the last laid down reads first.
  return [...written]
    .reverse()
    .map((source) => ({ op: 'insertSource', path: [OVERRIDES], index: at, source }));
}

/** Which of the two rules stood in the way, said as the reader would ask it. */
function whyNot(sheet: CompiledSheet, where: { sheet: SheetName; at: A1Addr }): string {
  return sheet.fills.some((fill) => fill.anchor === where.at)
    ? `\`${where.at}\` is where a range keeps its one formula, and an override here would take it from every cell the range fills — split the range instead`
    : `\`${where.at}\` is not written by anything, so there is nothing here to make an exception to`;
}

/** The override as a spec writes one: `at:` first, then what it says. */
function lines(where: { sheet: SheetName; at: A1Addr }, says: Says): string {
  const written = [`at: ${renderScalar(qualified(where.sheet, where.at))}`];

  if (says.formula !== undefined) written.push(`formula: ${renderScalar(says.formula, 'double')}`);
  else written.push(`value: ${renderScalar(says.value ?? null)}`);

  if (says.reason !== undefined && says.reason !== '') {
    written.push(`reason: ${renderScalar(says.reason, 'double')}`);
  }

  return written.join('\n');
}

/** The same lines as one item of a sequence, which is how the first one goes in. */
function indented(written: string): string {
  return written.split('\n').join('\n  ');
}

/** Where an override lands, as written; a `${param}` in it is not this cell's address until it is set. */
function spelled(at: Templated<QualifiedAddr>): string {
  return 'text' in at ? at.text : qualified(at.sheet, at.at);
}
