import type { Print } from '@yxl-vscode/spec';
import { ORIENTATIONS } from '@yxl-vscode/spec';
import {
  type CellRef,
  cellOf,
  type NodeId,
  parseA1Range,
  parseRowSpan,
  type Rect,
  rectOf,
  rowsOf,
  type SheetName,
} from '@yxl-vscode/units';
import { address, spelling } from './cell';
import { CODE } from './codes';
import { type Ctx, reject, text } from './ctx';
import type { CompiledPrint } from './grid';
import { extentOf, layoutHere } from './named';
import { say } from './text';

/**
 * A sheet's `print:` setup, its area, titles and breaks read, with the breaks
 * the sheet's layouts start pages at joined to them (`docs/spec.md` §5, §25).
 * `null` where the sheet says nothing about paper.
 */
export function printing(
  ctx: Ctx,
  one: Print | null,
  sheet: SheetName,
  breaks: readonly { readonly row: number; readonly node: NodeId }[],
): CompiledPrint | null {
  const joined = breaks.map(({ row }) => ({ col: 1, row }));
  if (one === null) {
    const [first] = breaks;
    return first === undefined ? null : { ...NOTHING_SET, breaks: joined, node: first.node };
  }

  return {
    area: area(ctx, one, sheet),
    titles: titles(ctx, one, sheet),
    orientation:
      one.orientation === null ? null : spelling(ctx, one.orientation, ORIENTATIONS, one),
    margins: one.margins,
    scale: one.scale,
    fit: one.fit,
    header: one.header === null ? null : text(ctx, one.header, one),
    footer: one.footer === null ? null : text(ctx, one.footer, one),
    breaks: [
      ...one.breaks.flatMap((at): CellRef[] => {
        const found = address(ctx, at, one);
        return found === null ? [] : [cellOf(found)];
      }),
      ...joined,
    ],
    node: one.id,
  };
}

const NOTHING_SET = {
  area: null,
  titles: null,
  orientation: null,
  margins: null,
  scale: null,
  fit: null,
  header: null,
  footer: null,
} as const;

function area(ctx: Ctx, one: Print, sheet: SheetName): Rect | null {
  if (one.area === null) return null;
  if (typeof one.area !== 'string' && one.area.kind === 'named') {
    const placed = layoutHere(ctx, one.area.text, sheet, one);
    return placed === null ? null : extentOf(placed);
  }

  const spelled = text(ctx, one.area, one);
  const read = parseA1Range(spelled);
  if (read === null) reject(ctx, CODE.badRange, say('compile.not-a-range', { spelled }), one);
  return read === null ? null : rectOf(read);
}

/** `print.titles`: rows as written, or a layout's header rows (`docs/spec.md` §5). */
function titles(ctx: Ctx, one: Print, sheet: SheetName): CompiledPrint['titles'] {
  if (one.titles === null) return null;
  if (typeof one.titles !== 'string' && one.titles.kind === 'named') {
    const name = one.titles.text;
    const placed = layoutHere(ctx, name, sheet, one);
    if (placed === null) return null;
    if (placed.depth === 0) {
      reject(ctx, CODE.badLayout, say('compile.no-header-to-repeat', { name }), one);
      return null;
    }
    return { first: placed.headerFirst, last: placed.bodyFirst - 1 };
  }

  const spelled = text(ctx, one.titles, one);
  const read = parseRowSpan(spelled);
  if (read === null) {
    reject(ctx, CODE.badRow, say('compile.not-a-row', { spelled }), one);
    return null;
  }
  return rowsOf(read);
}
