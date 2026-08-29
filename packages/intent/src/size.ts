import { type CompiledBand, type CompiledSheet, sheetOf } from '@yxl-vscode/compile';
import { holds, type Op } from '@yxl-vscode/cst';
import { type Axis, BAND_KEYS } from '@yxl-vscode/spec';
import type { SheetName } from '@yxl-vscode/units';
import { answer, bandOfItsOwn, type Span, spelled, splitBand } from './bands';
import { located, type Reading } from './direct';
import type { Candidate } from './resolve';
import { say } from './text';
import type { Projection } from './writes';

/**
 * Columns dragged to a width in character units, or rows to a height in points.
 * The span is what the reader had selected, and one column where they had not.
 */
export interface Dragged {
  readonly sheet: SheetName;
  readonly axis: Axis;
  readonly first: number;
  readonly last: number;
  readonly size: number;
}

/**
 * Every way of making those columns that wide — the `setSize` table, over a
 * span. A size is a band, never forty cells, so a band that
 * reaches past what was dragged is a question rather than an answer.
 */
export function setSize(spec: Projection, dragged: Dragged, read: Reading): readonly Candidate[] {
  const sheet = sheetOf(spec.grid, dragged.sheet);
  if (sheet === null || dragged.first < 1 || dragged.last < dragged.first || dragged.size < 0) {
    return [];
  }

  const span = spanOf(dragged);
  const bands = dragged.axis === 'column' ? sheet.columns : sheet.rows;

  // A band already over exactly this span is the band of its own, whether or
  // not it is what sizes them today (ADR-042).
  const exact = bands.findLast((band) => band.first === span.first && band.last === span.last);
  if (exact !== undefined) {
    const one = theBand(exact, dragged, read);
    return one === null ? [] : [{ ...one, alone: true }];
  }

  const over = bands.filter((band) => sizes(band, span));
  if (over.length === 0) {
    const own = ofItsOwn(sheet, dragged, read);
    return own === null ? [] : [{ ...own, alone: true }];
  }

  // Several bands size what was dragged, and each of them reaches past it: one
  // band over the span layers over them all, which is the only tidy answer.
  const one = over.length === 1 ? over[0] : undefined;
  if (one === undefined) {
    const own = ofItsOwn(sheet, dragged, read);
    return own === null ? [] : [{ ...own, alone: true }];
  }

  return [theBand(one, dragged, read), apart(one, dragged, read)].filter(
    (band): band is Candidate => band !== null,
  );
}

/** Whether the band is what gives any of them its size, which a band setting no size does not. */
function sizes(band: CompiledBand, span: Span): boolean {
  return band.size !== null && band.first <= span.last && band.last >= span.first;
}

/** The answer that writes a band for what was dragged, where nothing sizes it yet. */
function ofItsOwn(sheet: CompiledSheet, dragged: Dragged, read: Reading): Candidate | null {
  const written = bandOfItsOwn(
    sheet,
    spanOf(dragged),
    [[BAND_KEYS[dragged.axis].size, String(dragged.size)]],
    read,
  );
  if (written === null) return null;

  const many = dragged.last - dragged.first + 1;
  const what =
    many === 1
      ? say('intent.band-of-its-own', { axis: dragged.axis })
      : say('intent.one-band-over', { span: spelled(spanOf(dragged)), axis: dragged.axis });

  return answer('ofItsOwn', what, written.found, [written.op]);
}

/** The columns or rows a drag names, as a span. */
function spanOf(dragged: Dragged): Span {
  return { axis: dragged.axis, first: dragged.first, last: dragged.last };
}

/** The answer that changes the band the size comes from, every column of it included. */
function theBand(band: CompiledBand, dragged: Dragged, read: Reading): Candidate | null {
  const found = located(band.node, read);
  if (found.kind === 'refused' || found.node.kind !== 'map') return null;

  const key = BAND_KEYS[dragged.axis].size;
  const many = band.last - band.first + 1;
  const over = spelled({ axis: dragged.axis, first: band.first, last: band.last });
  const what =
    many === 1
      ? say('intent.change-the-band', { span: over })
      : say('intent.which-is-many', {
          said: say('intent.change-the-band', { span: over }),
          many,
          axis: dragged.axis,
        });

  const op: Op = holds(found.node, key)
    ? { op: 'set', path: [...found.path, key], value: dragged.size }
    : { op: 'add', path: found.path, key, value: dragged.size, before: null };

  return answer('band', what, found, [op]);
}

/** The answer that splits the band so what was dragged stands alone, keeping every key it had. */
function apart(band: CompiledBand, dragged: Dragged, read: Reading): Candidate | null {
  const span = spanOf(dragged);
  const size = [[BAND_KEYS[dragged.axis].size, String(dragged.size)] as const];
  const split = splitBand(band, span, size, read);
  if (split === null) return null;

  return answer(
    'apart',
    say('intent.split-so-alone', { span: spelled(span) }),
    split.found,
    split.ops,
  );
}
