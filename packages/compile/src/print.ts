import type { Print } from '@yxl-vscode/spec';
import { ORIENTATIONS } from '@yxl-vscode/spec';
import { cellOf, parseA1Range, rectOf } from '@yxl-vscode/units';
import { address, spelling } from './cell';
import { CODE } from './codes';
import { type Ctx, reject, text } from './ctx';
import type { CompiledPrint } from './grid';
import { say } from './text';

/** One `print:` setup, its area and its breaks read (`docs/spec.md` §5). */
export function printing(ctx: Ctx, one: Print): CompiledPrint {
  const spelled = one.area === null ? null : text(ctx, one.area, one);
  const read = spelled === null ? null : parseA1Range(spelled);
  if (spelled !== null && read === null) {
    reject(ctx, CODE.badRange, say('compile.not-a-range', { spelled }), one);
  }

  return {
    area: read === null ? null : rectOf(read),
    orientation:
      one.orientation === null ? null : spelling(ctx, one.orientation, ORIENTATIONS, one),
    margins: one.margins,
    scale: one.scale,
    fit: one.fit,
    header: one.header === null ? null : text(ctx, one.header, one),
    footer: one.footer === null ? null : text(ctx, one.footer, one),
    breaks: one.breaks.flatMap((at) => {
      const found = address(ctx, at, one);
      return found === null ? [] : [cellOf(found)];
    }),
    node: one.id,
  };
}
