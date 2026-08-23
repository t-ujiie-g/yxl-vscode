import { sheetOf } from '@yxl-vscode/compile';
import { type Axis, KEY } from '@yxl-vscode/spec';
import type { SheetName } from '@yxl-vscode/units';
import { type Says, type Span, setBandKey, spelled } from './bands';
import type { Reading } from './direct';
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

/** Every way of hiding those columns, or of showing them again — §4.4's band rows with `hidden:`. */
export function setHidden(spec: Projection, hiding: Hiding, read: Reading): readonly Candidate[] {
  const sheet = sheetOf(spec.grid, hiding.sheet);
  if (sheet === null || hiding.first < 1 || hiding.last < hiding.first) return [];

  const span: Span = { axis: hiding.axis, first: hiding.first, last: hiding.last };
  const bands = hiding.axis === 'column' ? sheet.columns : sheet.rows;
  const said = hiding.hidden ? 'Hide' : 'Show';

  const says: Says = {
    key: KEY.hidden,
    value: hiding.hidden,
    clears: !hiding.hidden,
    said: (band) => band.hidden === true,
    words: {
      own: (one) => `${said} \`${spelled(one)}\``,
      band: (over, many) =>
        many === span.last - span.first + 1
          ? `${said} \`${spelled(over)}\``
          : `${said} the band over \`${spelled(over)}\`, which is ${many} ${span.axis}s`,
      apart: (one) => `Split it so \`${spelled(one)}\` alone is shown`,
    },
  };

  return setBandKey(sheet, bands, span, says, read);
}
