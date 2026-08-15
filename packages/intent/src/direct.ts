import {
  type CompiledGrid,
  type CompiledSheet,
  cellAt,
  type FacetOrigin,
} from '@yxl-vscode/compile';
import { type Node, nodeAt, type Path, parse } from '@yxl-vscode/cst';
import { pathOf } from '@yxl-vscode/loader';
import type { Patch } from '@yxl-vscode/patch';
import { type A1Addr, type FilePath, qualified, type SheetName } from '@yxl-vscode/units';
import type { Expects } from '@yxl-vscode/verify';

/**
 * What a gesture on the grid came to.
 *
 * Either an edit to make — which file it is in, what it does, and what it says
 * it will change — or a refusal in words a reader can act on. There is no third
 * answer where the editor guesses (ADR-001).
 */
export type Intent =
  | {
      readonly kind: 'edit';
      readonly file: FilePath;
      readonly patch: Patch;
      readonly expects: Expects;
    }
  | { readonly kind: 'refused'; readonly why: string };

/** The text of a file the spec was read from, as it stands. */
export type Text = (file: FilePath) => string | null;

/**
 * Typing a value into a cell.
 *
 * Only the cells whose value one node of the spec wrote can be edited this way:
 * a literal at the cell, or one field of an inline `data:` block. Everything
 * else has more than one answer or none — a definition reaches other cells, a
 * CSV is a file of its own, a `formulas:` range is one formula for many cells —
 * and each of those is a *refusal with a reason* until the phase that can offer
 * the choice (ADR-006).
 */
export function setValue(
  grid: CompiledGrid,
  where: { sheet: SheetName; at: A1Addr },
  value: string | number | boolean | null,
  text: Text,
): Intent {
  const sheet = grid.sheets.find((one) => one.name === where.sheet);
  if (sheet === undefined) return refused(`there is no sheet named \`${where.sheet}\``);

  const cell = cellAt(sheet, where.at);
  if (cell === null) return refused(`nothing is written at \`${where.at}\``);

  const found = valuePath(cell.provenance.value, sheet, where.at, text);
  if (found.kind === 'refused') return found;

  return {
    kind: 'edit',
    file: found.file,
    patch: { ops: [{ op: 'set', path: found.path, value }] },
    expects: { cells: new Set([qualified(where.sheet, where.at)]), beyond: 'ask' },
  };
}

/**
 * Typing a formula into a cell that already holds one.
 *
 * A cell written as a bare value has no `formula:` key to write into, and
 * giving it one is a change of shape rather than of content — which is the
 * phase after this one.
 */
export function setFormula(
  grid: CompiledGrid,
  where: { sheet: SheetName; at: A1Addr },
  formula: string,
  text: Text,
): Intent {
  const sheet = grid.sheets.find((one) => one.name === where.sheet);
  if (sheet === undefined) return refused(`there is no sheet named \`${where.sheet}\``);

  const cell = cellAt(sheet, where.at);
  if (cell === null || cell.formula === null) {
    return refused(`\`${where.at}\` holds no formula to change`);
  }

  const written = literalPath(cell.provenance.value, sheet, where.at, text);
  if (written.kind === 'refused') return written;

  const at = written.node;
  if (at.kind !== 'map' || !at.entries.some((entry) => entry.key.value === 'formula')) {
    return refused(`\`${where.at}\` is written as a value, not as a formula`);
  }

  return {
    kind: 'edit',
    file: written.file,
    patch: { ops: [{ op: 'set', path: [...written.path, 'formula'], value: formula }] },
    expects: { cells: new Set([qualified(sheet.name, where.at)]), beyond: 'ask' },
  };
}

type Found =
  | { kind: 'found'; file: FilePath; path: Path; node: Node }
  | { kind: 'refused'; why: string };

/** Where a value is written, for the origins one node can be edited through. */
function valuePath(origin: FacetOrigin, sheet: CompiledSheet, at: A1Addr, text: Text): Found {
  if (origin.kind === 'inline') {
    const block = located(origin.node, text);
    if (block.kind === 'refused') return block;

    return {
      ...block,
      path: [...block.path, 'values', origin.row, origin.col],
    };
  }

  const written = literalPath(origin, sheet, at, text);
  if (written.kind === 'refused') return written;

  // `A1: 42` writes the value at the cell itself; `A1: { value: 42, … }` writes
  // it under a key. Which one this spec used is a fact about the file, and the
  // file is what says so.
  if (written.node.kind !== 'map') return written;

  const holds = (key: string): boolean =>
    written.node.kind === 'map' && written.node.entries.some((entry) => entry.key.value === key);

  // A `value:` beside a `formula:` is the result Excel cached, not the cell's
  // own value (`docs/spec.md` §3). Typing a number over it would leave the
  // formula in place and the workbook showing something else until Excel
  // recomputed — a lie with a long life. Change the formula instead.
  if (holds('formula')) {
    return refused(`\`${at}\` holds a formula — type a formula to change it, starting with \`=\``);
  }

  if (holds('value')) return { ...written, path: [...written.path, 'value'] };
  return refused(`\`${at}\` is not written as a value this can change`);
}

/** The node that wrote a cell, where one node did. */
function literalPath(origin: FacetOrigin, sheet: CompiledSheet, at: A1Addr, text: Text): Found {
  switch (origin.kind) {
    case 'literal':
    case 'override':
      return located(origin.node, text);

    case 'defRef':
      return refused(
        `\`${at}\` reads a definition, which other cells read too — changing it here would change them as well`,
      );

    case 'param':
      return refused(`\`${at}\` reads the parameter \`${origin.params[0] ?? ''}\``);

    case 'external':
      return refused(`\`${at}\` reads row ${origin.row + 1} of \`${beside(origin.file)}\``);

    case 'formulaRange':
      return refused(
        `\`${at}\` is filled by the range anchored at \`${origin.anchor}\`, which writes one formula for every cell it covers`,
      );

    case 'inline':
      return located(origin.node, text);

    default:
      return refused(`\`${at}\` on \`${sheet.name}\` holds nothing to change yet`);
  }
}

/** The node an id names, read out of the file it lives in. */
function located(id: string, text: Text): Found {
  const where = pathOf(id as never);
  if (where === null) return refused('this cell has no place in the file to edit');

  const source = text(where.file);
  if (source === null) return refused(`\`${where.file}\` could not be read`);

  const { root } = parse(source, { file: where.file });
  const node = root === null ? null : nodeAt(root, where.path);
  if (node === null)
    return refused(`nothing is at \`${where.path.join('.')}\` in \`${where.file}\``);

  return { kind: 'found', file: where.file, path: where.path, node };
}

/** A file as a reader would name it, which is not the whole way there. */
function beside(file: string): string {
  return file.split('/').slice(-2).join('/');
}

function refused(why: string): Intent & { kind: 'refused' } {
  return { kind: 'refused', why };
}
