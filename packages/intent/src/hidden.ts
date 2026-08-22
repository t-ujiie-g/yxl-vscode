import { type CompiledBand, sheetOf } from '@yxl-vscode/compile';
import { holds, type Op } from '@yxl-vscode/cst';
import type { Axis } from '@yxl-vscode/spec';
import type { SheetName } from '@yxl-vscode/units';
import { answer, bandOfItsOwn, type Span, soleBand, spelled, splitBand } from './bands';
import { located, type Reading } from './direct';
import type { Candidate } from './resolve';
import type { Projection } from './writes';

/** Columns or rows a reader asked to hide, or to show again (`docs/spec.md` §4 `hidden:`). */
export interface Hiding {
  readonly sheet: SheetName;
  readonly axis: Axis;
  readonly first: number;
  readonly last: number;
  readonly hidden: boolean;
}

/** The key a band hides under, which is the same word on both axes. */
const HIDDEN = 'hidden';

/**
 * Every way of hiding those columns, or of showing them again — §4.4's band
 * rows once more, with `hidden:` where a size would be (ADR-042).
 */
export function setHidden(spec: Projection, hiding: Hiding, read: Reading): readonly Candidate[] {
  const sheet = sheetOf(spec.grid, hiding.sheet);
  if (sheet === null || hiding.first < 1 || hiding.last < hiding.first) return [];

  const span: Span = { axis: hiding.axis, first: hiding.first, last: hiding.last };
  const bands = hiding.axis === 'column' ? sheet.columns : sheet.rows;
  const over = bands.filter((band) => band.hidden === true && reaches(band, span));

  const exact = bands.findLast((band) => band.first === span.first && band.last === span.last);
  if (exact !== undefined) {
    const one = theBand(exact, span, hiding.hidden, read, over.length > 1);
    return one === null ? [] : [{ ...one, alone: true }];
  }

  // Nothing hides them and nothing is being asked of them.
  if (!hiding.hidden && over.length === 0) return [];

  const one = over.length === 1 ? over[0] : undefined;
  if (!hiding.hidden && one !== undefined && !within(one, span)) {
    return [theBand(one, span, false, read, false), apart(one, span, read)].filter(
      (band): band is Candidate => band !== null,
    );
  }

  const own = ofItsOwn(sheet, span, hiding.hidden, read);
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

/** The answer that writes a band for what was named, where no band is over it. */
function ofItsOwn(
  sheet: Parameters<typeof bandOfItsOwn>[0],
  span: Span,
  hidden: boolean,
  read: Reading,
): Candidate | null {
  const written = bandOfItsOwn(sheet, span, [[HIDDEN, String(hidden)]], read);
  if (written === null) return null;

  const what = hidden ? `Hide \`${spelled(span)}\`` : `Show \`${spelled(span)}\` again`;
  return answer('ofItsOwn', what, written.found, [written.op]);
}

/** The answer that says it on the band already there; showing again takes the key out where it can. */
function theBand(
  band: CompiledBand,
  span: Span,
  hidden: boolean,
  read: Reading,
  others: boolean,
): Candidate | null {
  const found = located(band.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const held = holds(found.node, HIDDEN);
  const off = !hidden && !others;
  const rest = found.node.entries.length;

  const gone =
    rest <= 2
      ? soleBand(found, read)
        ? found.path.slice(0, -1)
        : found.path
      : [...found.path, HIDDEN];
  const op: Op = off
    ? { op: 'remove', path: gone }
    : held
      ? { op: 'set', path: [...found.path, HIDDEN], value: hidden }
      : { op: 'add', path: found.path, key: HIDDEN, value: hidden, before: null };
  if (off && !held) return null;

  const over: Span = { axis: span.axis, first: band.first, last: band.last };
  const many = band.last - band.first + 1;
  const said = hidden ? 'Hide' : 'Show';
  const what =
    many === span.last - span.first + 1
      ? `${said} \`${spelled(over)}\``
      : `${said} the band over \`${spelled(over)}\`, which is ${many} ${span.axis}s`;

  return answer('band', what, found, [op]);
}

/** The answer that splits the band so the run stands alone, shown while the rest stays hidden. */
function apart(band: CompiledBand, span: Span, read: Reading): Candidate | null {
  const split = splitBand(band, span, [[HIDDEN, 'false']], read);
  if (split === null) return null;

  return answer('apart', `Split it so \`${spelled(span)}\` alone is shown`, split.found, split.ops);
}
