import { type CompiledGrid, type CompiledSheet, cellAt, sheetOf } from '@yxl-vscode/compile';
import { nodeAt, type Op, renderScalar, type Value } from '@yxl-vscode/cst';
import type { Message } from '@yxl-vscode/diag';
import { KEY, type Templated } from '@yxl-vscode/spec';
import { type A1Addr, type QualifiedAddr, qualified, type SheetName } from '@yxl-vscode/units';
import { itemOf } from './anchored';
import { type Intent, type Projection, type Reading, refused } from './direct';
import { say } from './text';

/** What an override says about one cell, beside where it says it. */
export interface Says {
  readonly value?: Value;
  readonly formula?: string;
  readonly style?: string;
  readonly format?: string;
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
  spec: Projection,
  where: { sheet: SheetName; at: A1Addr },
  says: Says,
  read: Reading,
): Intent {
  return overrides(spec, where.sheet, [{ at: where.at, says }], read);
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
  spec: Projection,
  where: SheetName,
  these: readonly Excepted[],
  read: Reading,
): Intent {
  const { doc, grid } = spec;
  const sheet = sheetOf(grid, where);
  if (sheet === null) return refused(say('intent.no-such-sheet', { sheet: where }));
  if (these.length === 0) return refused(say('intent.nothing-to-except'));

  const file = doc.file;
  const tree = read.parsed(file);
  if (tree === null) return refused(say('intent.file-unreadable', { file }));

  const root = tree.root;
  if (root === null || root.kind !== 'map') {
    return refused(say('intent.no-document-for-override'));
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
    patch: { ops: writing(written, nodeAt(root, [KEY.overrides]) !== null, doc.overrides.length) },
    expects: {
      cells: new Set(these.map((one) => qualified(where, one.at))),
      beyond: 'ask',
    },
  };
}

/** The entries going in, under the key where the spec has one and with it where it has none. */
function writing(written: readonly string[], held: boolean, at: number): Op[] {
  if (!held) {
    const source = written.map(itemOf).join('\n');
    return [{ op: 'addSource', path: [], key: KEY.overrides, source }];
  }

  // Entries added at one place are spliced from the end, so the last laid down reads first.
  return [...written]
    .reverse()
    .map((source) => ({ op: 'insertSource', path: [KEY.overrides], index: at, source }));
}

/** Which of the two rules stood in the way, said as the reader would ask it. */
function whyNot(sheet: CompiledSheet, where: { sheet: SheetName; at: A1Addr }): Message {
  return sheet.fills.some((fill) => fill.anchor === where.at)
    ? say('intent.range-keeps-its-formula', { at: where.at })
    : say('intent.nothing-writes-it', { at: where.at });
}

/** The override as a spec writes one: `at:` first, then what it says. */
function lines(where: { sheet: SheetName; at: A1Addr }, says: Says): string {
  const written = [`at: ${renderScalar(qualified(where.sheet, where.at))}`];

  // The facets are independent, so an override says only the ones it is about
  // (`docs/spec.md` §23); a look asked for says no value at all.
  if (says.formula !== undefined) written.push(`formula: ${renderScalar(says.formula, 'double')}`);
  else if (says.style === undefined && says.format === undefined) {
    written.push(`value: ${renderScalar(says.value ?? null)}`);
  }

  if (says.style !== undefined) written.push(`style: ${says.style}`);
  if (says.format !== undefined) written.push(`format: ${says.format}`);

  if (says.reason !== undefined && says.reason !== '') {
    written.push(`reason: ${renderScalar(says.reason, 'double')}`);
  }

  return written.join('\n');
}

/** Where an override lands, as written; a `${param}` in it is not this cell's address until it is set. */
function spelled(at: Templated<QualifiedAddr>): string {
  return 'text' in at ? at.text : qualified(at.sheet, at.at);
}
