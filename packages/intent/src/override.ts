import { type CompiledGrid, type CompiledSheet, cellAt, sheetOf } from '@yxl-vscode/compile';
import { nodeAt, renderScalar, type Value } from '@yxl-vscode/cst';
import type { SpecDoc, Templated } from '@yxl-vscode/spec';
import { type A1Addr, type QualifiedAddr, qualified, type SheetName } from '@yxl-vscode/units';
import type { Intent, Reading } from './direct';

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
  const sheet = sheetOf(grid, where.sheet);
  if (sheet === null) {
    return { kind: 'refused', why: `there is no sheet named \`${where.sheet}\`` };
  }

  if (!overridable(grid, where)) return { kind: 'refused', why: whyNot(sheet, where) };

  const file = doc.file;
  const tree = read.parsed(file);
  if (tree === null) return { kind: 'refused', why: `\`${file}\` could not be read` };

  const root = tree.root;
  if (root === null || root.kind !== 'map') {
    return { kind: 'refused', why: 'this spec has no document to write an override into' };
  }

  const wanted = qualified(where.sheet, where.at);
  const already = doc.overrides.findIndex((one) => spelled(one.at) === wanted);

  const written = lines(where, says);
  const held = nodeAt(root, [OVERRIDES]);

  const patch =
    held === null
      ? {
          ops: [
            {
              op: 'addSource' as const,
              path: [],
              key: OVERRIDES,
              source: `- ${indented(written)}`,
            },
          ],
        }
      : {
          ops: [
            {
              op: 'insertSource' as const,
              path: [OVERRIDES],
              index: doc.overrides.length,
              source: written,
            },
          ],
        };

  // Two overrides for one cell would be two answers, and the compiler takes the last.
  if (already !== -1) {
    return {
      kind: 'refused',
      why: `\`${where.at}\` is already overridden — change that override, at \`overrides\` entry ${already + 1}`,
    };
  }

  return {
    kind: 'edit',
    file,
    patch,
    expects: { cells: new Set([qualified(where.sheet, where.at)]), beyond: 'ask' },
  };
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
