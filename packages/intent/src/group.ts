import { sheetOf } from '@yxl-vscode/compile';
import type { Axis } from '@yxl-vscode/spec';
import type { SheetName } from '@yxl-vscode/units';
import { type Says, type Span, setBandKey, spelled } from './bands';
import type { Reading } from './direct';
import type { Candidate } from './resolve';
import type { Projection } from './writes';

/** Columns or rows a reader asked to group, or to take out of the outline (`docs/spec.md` §4). */
export interface Grouping {
  readonly sheet: SheetName;
  readonly axis: Axis;
  readonly first: number;
  readonly last: number;
  readonly level: number;
}

/** The deepest outline Excel holds, which the schema takes from it (`docs/spec.md` §4). */
const DEEPEST = 7;

/**
 * Every way of putting those columns in an outline, or taking them out — §4.4's
 * band rows with `group:`. Level `0` is the schema's own word for ungrouped,
 * which it keeps apart from the key being absent.
 */
export function setGroup(
  spec: Projection,
  grouping: Grouping,
  read: Reading,
): readonly Candidate[] {
  const sheet = sheetOf(spec.grid, grouping.sheet);
  const level = Math.trunc(grouping.level);
  if (sheet === null || grouping.first < 1 || grouping.last < grouping.first) return [];
  if (level < 0 || level > DEEPEST) return [];

  const span: Span = { axis: grouping.axis, first: grouping.first, last: grouping.last };
  const bands = grouping.axis === 'column' ? sheet.columns : sheet.rows;
  const said = (one: Span) =>
    level === 0
      ? `Take \`${spelled(one)}\` out of the outline`
      : `Group \`${spelled(one)}\` at level ${level}`;

  const says: Says = {
    key: 'group',
    value: level,
    clears: level === 0,
    said: (band) => (band.group ?? 0) > 0,
    words: {
      own: said,
      band: (over, many) =>
        many === span.last - span.first + 1
          ? said(over)
          : `${said(over)}, which is ${many} ${span.axis}s`,
      apart: (one) => `Split it so \`${spelled(one)}\` alone is out`,
    },
  };

  return setBandKey(sheet, bands, span, says, read);
}
