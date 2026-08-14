import type { Brand } from './brand';

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

/** A selector splits on its *first* `-`, so `B-` has an empty end and is refused. */
function endpoints(text: string): [string, string | null] {
  const dash = text.indexOf('-');
  return dash < 0 ? [text, null] : [text.slice(0, dash), text.slice(dash + 1)];
}

function columnIndex(label: string): number {
  let index = 0;
  for (const letter of label) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index;
}
