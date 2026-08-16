import { type CompiledGrid, sheetOf } from '@yxl-vscode/compile';
import { nodeAt, parse, renderScalar, type Value } from '@yxl-vscode/cst';
import type { SpecDoc, Templated } from '@yxl-vscode/spec';
import { type A1Addr, type QualifiedAddr, qualified, type SheetName } from '@yxl-vscode/units';
import type { Intent, Text } from './direct';

/** The key this all writes into (`docs/spec.md` §23). */
const OVERRIDES = 'overrides';

/** What an override says about one cell, beside where it says it. */
export interface Says {
  readonly value?: Value;
  readonly formula?: string;
  readonly reason?: string;
}

/**
 * A cell written as an override — the exception said out loud
 * (`docs/spec.md` §23).
 *
 * This is the answer to every refusal `direct` editing gives: the value comes
 * from a parameter, a CSV, a definition, a range covering five hundred cells,
 * and *this one cell* has to differ. Every other way out damages the spec —
 * inline the parameter, split the range, stop reading the column from the file
 * — by turning one exception into a change of structure.
 *
 * Never offered by itself, only when a reader asks for it after being told why
 * an ordinary edit was refused (ADR-007): an escape hatch that opens on its own
 * is not an escape hatch, it is the door.
 */
export function override(
  doc: SpecDoc,
  grid: CompiledGrid,
  where: { sheet: SheetName; at: A1Addr },
  says: Says,
  text: Text,
): Intent {
  const sheet = sheetOf(grid, where.sheet);
  if (sheet === null) {
    return { kind: 'refused', why: `there is no sheet named \`${where.sheet}\`` };
  }

  const file = doc.file;
  const source = text(file);
  if (source === null) return { kind: 'refused', why: `\`${file}\` could not be read` };

  const { root } = parse(source, { file });
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

  // An override for a cell that already has one would be two answers to one
  // question, and the compiler takes the last. Changing the one that is there
  // is an edit to a cell like any other, which is the phase that resolves.
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

/**
 * Where an override lands, as it is written.
 *
 * A `${param}` in the address is left as the spec spelled it: it is not this
 * cell's address until the parameter is set, and an override that *might* be
 * about this cell is not one to write a second beside.
 */
function spelled(at: Templated<QualifiedAddr>): string {
  return 'text' in at ? at.text : qualified(at.sheet, at.at);
}
