import { type Op, renderScalar } from '@yxl-vscode/cst';
import { KEY, type ScalarValue } from '@yxl-vscode/spec';
import { type Rect, rangeOf, type SheetName } from '@yxl-vscode/units';
import { nothingChanges } from '@yxl-vscode/verify';
import { type Anchored, anchored, putEntry, takeEntries } from './anchored';
import { type Intent, type Projection, type Reading, refused, writtenSheet } from './direct';

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
  const found = writtenSheet(spec, where.sheet, read);
  if (found.kind === 'refused') return found;

  const holds = anchored(found, KEY.validations, where.rect);
  const choices = where.choices;
  const ops =
    choices === null
      ? takeEntries(holds, 'nothing here has a validation to take off')
      : putting(choices, where.rect, holds);

  if ('why' in ops) return refused(ops.why);

  return { kind: 'edit', file: found.file, patch: ops, expects: nothingChanges };
}

function putting(
  choices: readonly ScalarValue[],
  rect: Rect,
  holds: Anchored,
): { ops: readonly Op[] } | { why: string } {
  if (choices.length === 0) return { why: 'a list needs a choice to offer' };

  const over = holds.touched[0]?.rect;
  if (over !== undefined) {
    return {
      why: `\`${rangeOf(over)}\` already has a validation, and a cell takes one at a time`,
    };
  }

  const body = `${KEY.at}: ${rangeOf(rect)}\n${KEY.list}: ${offering(choices)}`;
  return { ops: [putEntry(holds, body)] };
}

/** The choices as Excel keeps them: one flow sequence, which is how the spec's examples write it. */
function offering(choices: readonly ScalarValue[]): string {
  return `[${choices.map((one) => renderScalar(one)).join(', ')}]`;
}
