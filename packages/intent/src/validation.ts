import { sheetOf } from '@yxl-vscode/compile';
import { entryOf, type Node, type Op, type Path, renderScalar } from '@yxl-vscode/cst';
import { KEY, type ScalarValue } from '@yxl-vscode/spec';
import {
  overlapping,
  parseA1Range,
  type Rect,
  rangeOf,
  rectOf,
  type SheetName,
} from '@yxl-vscode/units';
import { nothingChanges } from '@yxl-vscode/verify';
import { type Intent, located, type Projection, type Reading, refused } from './direct';

/** A validation as a gesture asks for it: the choices a range takes, or `null` to take one off. */
export interface Validating {
  readonly sheet: SheetName;
  readonly rect: Rect;
  readonly choices: readonly ScalarValue[] | null;
}

/**
 * A `list:` validation written over a range, or the ones a range touches taken
 * off (`docs/spec.md` §10). A range that already has one is refused rather than
 * given a second: which of the two Excel would ask is not ours to pick (ADR-001).
 */
export function setValidation(spec: Projection, where: Validating, read: Reading): Intent {
  const sheet = sheetOf(spec.grid, where.sheet);
  if (sheet === null) return refused(`there is no sheet named \`${where.sheet}\``);

  const found = located(sheet.node, read);
  if (found.kind === 'refused') return found;
  if (found.node.kind !== 'map') return refused(`\`${where.sheet}\` is not written as a sheet`);

  const written = entryOf(found.node, KEY.validations)?.value ?? null;
  const items = written?.kind === 'seq' ? written.items : [];
  const under: Path = [...found.path, KEY.validations];
  const touched = items
    .map((item, index) => ({ index, rect: rectAt(item) }))
    .filter((one) => one.rect !== null && overlapping(one.rect, where.rect));

  const choices = where.choices;
  const ops =
    choices === null
      ? taken(touched, items.length, under)
      : putting(choices, where.rect, touched, { under, sheet: found.path, many: items.length });

  if ('why' in ops) return refused(ops.why);

  return { kind: 'edit', file: found.file, patch: ops, expects: nothingChanges };
}

/** Where in the sheet the validations are written, and how many are there already. */
interface Where {
  readonly under: Path;
  readonly sheet: Path;
  readonly many: number;
}

function putting(
  choices: readonly ScalarValue[],
  rect: Rect,
  touched: readonly { readonly index: number; readonly rect: Rect | null }[],
  where: Where,
): { ops: readonly Op[] } | { why: string } {
  if (choices.length === 0) return { why: 'a list needs a choice to offer' };

  const over = touched[0]?.rect;
  if (over !== undefined && over !== null) {
    return {
      why: `\`${rangeOf(over)}\` already has a validation, and a cell takes one at a time`,
    };
  }

  const listed = `${KEY.at}: ${rangeOf(rect)}\n${KEY.list}: ${offering(choices)}`;
  const op: Op =
    where.many === 0
      ? { op: 'addSource', path: where.sheet, key: KEY.validations, source: itemOf(listed) }
      : { op: 'insertSource', path: where.under, index: where.many, source: listed };

  return { ops: [op] };
}

/** The validations a range touches, taken out; the key goes with the last of them. */
function taken(
  touched: readonly { readonly index: number }[],
  all: number,
  under: Path,
): { ops: readonly Op[] } | { why: string } {
  if (touched.length === 0) return { why: 'nothing here has a validation to take off' };
  if (touched.length === all) return { ops: [{ op: 'remove', path: under }] };

  return { ops: touched.map((one) => ({ op: 'remove', path: [...under, one.index] })) };
}

/** The range one entry covers, as the file writes it; a `${...}` in its place covers nothing here. */
function rectAt(item: Node): Rect | null {
  const written = entryOf(item, KEY.at)?.value ?? null;
  if (written === null || written.kind !== 'scalar' || typeof written.value !== 'string') {
    return null;
  }

  const read = parseA1Range(written.value);
  return read === null ? null : rectOf(read);
}

/** The same entry as the first item of a sequence: `- ` takes two columns, and what follows lines up under it. */
function itemOf(entry: string): string {
  return `- ${entry.split('\n').join('\n  ')}`;
}

/** The choices as Excel keeps them: one flow sequence, which is how the spec's examples write it. */
function offering(choices: readonly ScalarValue[]): string {
  return `[${choices.map((one) => renderScalar(one)).join(', ')}]`;
}
