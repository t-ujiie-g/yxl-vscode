import type { Axis } from '@yxl-vscode/spec';
import { columnLabel } from '@yxl-vscode/units';

/** A run of columns or rows as the reader sees it named: `column B`, `rows 3-7`. */
export function spanSaid(axis: Axis, first: number, last: number): string {
  const said = (at: number) => (axis === 'column' ? columnLabel(at) : String(at));
  const one = axis === 'column' ? 'column' : 'row';

  return first === last ? `${one} ${said(first)}` : `${one}s ${said(first)}-${said(last)}`;
}
