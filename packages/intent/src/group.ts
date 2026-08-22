import { type CompiledBand, sheetOf } from '@yxl-vscode/compile';
import { holds, type Op } from '@yxl-vscode/cst';
import type { Axis } from '@yxl-vscode/spec';
import type { SheetName } from '@yxl-vscode/units';
import { answer, bandOfItsOwn, type Span, soleBand, spelled, splitBand } from './bands';
import { located, type Reading } from './direct';
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

/** The key an outline level is written under, and the deepest one Excel holds (`docs/spec.md` §4). */
const GROUP = 'group';
const DEEPEST = 7;

/**
 * Every way of putting those columns in an outline, or taking them out of one —
 * §4.4's band rows with `group:` where a size would be (ADR-042). Level `0` is
 * ungrouped, which the schema keeps apart from the key being absent.
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
  const over = bands.filter((band) => (band.group ?? 0) > 0 && reaches(band, span));

  const exact = bands.findLast((band) => band.first === span.first && band.last === span.last);
  if (exact !== undefined) {
    const one = theBand(exact, span, level, read);
    return one === null ? [] : [{ ...one, alone: true }];
  }

  // Nothing groups them and nothing is being asked of them.
  if (level === 0 && over.length === 0) return [];

  const one = over.length === 1 ? over[0] : undefined;
  if (level === 0 && one !== undefined && !within(one, span)) {
    return [theBand(one, span, 0, read), apart(one, span, read)].filter(
      (band): band is Candidate => band !== null,
    );
  }

  const own = ofItsOwn(sheet, span, level, read);
  return own === null ? [] : [{ ...own, alone: true }];
}

/** Whether the band says anything about any of them. */
function reaches(band: CompiledBand, span: Span): boolean {
  return band.first <= span.last && band.last >= span.first;
}

/** Whether the band says it about no more than what was asked. */
function within(band: CompiledBand, span: Span): boolean {
  return band.first >= span.first && band.last <= span.last;
}

/** What an answer says it does, which reads the same wherever it is written. */
function said(level: number, span: Span): string {
  return level === 0
    ? `Take \`${spelled(span)}\` out of the outline`
    : `Group \`${spelled(span)}\` at level ${level}`;
}

/** The answer that writes a band for what was named, where no band is over it. */
function ofItsOwn(
  sheet: Parameters<typeof bandOfItsOwn>[0],
  span: Span,
  level: number,
  read: Reading,
): Candidate | null {
  const written = bandOfItsOwn(sheet, span, [[GROUP, String(level)]], read);
  return written === null
    ? null
    : answer('ofItsOwn', said(level, span), written.found, [written.op]);
}

/** The answer that says it on the band already there; level `0` takes the key out where it can. */
function theBand(band: CompiledBand, span: Span, level: number, read: Reading): Candidate | null {
  const found = located(band.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const held = holds(found.node, GROUP);
  const off = level === 0;
  if (off && !held) return null;

  const rest = found.node.entries.length;
  const gone =
    rest <= 2
      ? soleBand(found, read)
        ? found.path.slice(0, -1)
        : found.path
      : [...found.path, GROUP];

  const op: Op = off
    ? { op: 'remove', path: gone }
    : held
      ? { op: 'set', path: [...found.path, GROUP], value: level }
      : { op: 'add', path: found.path, key: GROUP, value: level, before: null };

  const over: Span = { axis: span.axis, first: band.first, last: band.last };
  const many = band.last - band.first + 1;
  const what =
    many === span.last - span.first + 1
      ? said(level, over)
      : `${said(level, over)}, which is ${many} ${span.axis}s`;

  return answer('band', what, found, [op]);
}

/** The answer that splits the band so the run stands alone, out of the outline the rest stays in. */
function apart(band: CompiledBand, span: Span, read: Reading): Candidate | null {
  const split = splitBand(band, span, [[GROUP, '0']], read);
  if (split === null) return null;

  return answer('apart', `Split it so \`${spelled(span)}\` alone is out`, split.found, split.ops);
}
