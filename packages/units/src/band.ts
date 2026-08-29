import type { Brand } from './brand';
import { columnIndex, endpoints } from './grid';

/** Which way a band runs: over columns, or over rows (`docs/spec.md` §4). */
export type Axis = 'column' | 'row';

/** What a `columns:` band selects: one column label or an inclusive range — `B`, `D-F`. */
export type ColumnSpan = Brand<string, 'ColumnSpan'>;

/** What a `rows:` band selects: one row number or an inclusive range — `1`, `2-4`. */
export type RowSpan = Brand<string, 'RowSpan'>;

const COLUMN = /^[A-Z]+$/;
const ROW = /^0*[1-9][0-9]*$/;

/** Read a column selector, or `null` when it is not one or runs backwards. */
export function parseColumnSpan(text: string): ColumnSpan | null {
  const [first, last] = endpoints(text);
  if (!COLUMN.test(first)) return null;
  if (last === null) return text as ColumnSpan;
  if (!COLUMN.test(last) || columnIndex(last) < columnIndex(first)) return null;
  return text as ColumnSpan;
}

/** Read a row selector, or `null` when it is not one or runs backwards. */
export function parseRowSpan(text: string): RowSpan | null {
  const [first, last] = endpoints(text);
  if (!ROW.test(first)) return null;
  if (last === null) return text as RowSpan;
  if (!ROW.test(last) || Number(last) < Number(first)) return null;
  return text as RowSpan;
}
