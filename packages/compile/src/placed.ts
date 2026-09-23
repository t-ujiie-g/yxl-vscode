import type {
  DataRow,
  FooterRow,
  HeaderCell,
  Layout,
  LayoutColumn,
  ScalarValue,
} from '@yxl-vscode/spec';
import type { FilePath, SheetName } from '@yxl-vscode/units';

/**
 * A layout placed ahead of every sheet, which is what lets a spec name it from
 * anywhere (`docs/spec.md` §25): its columns where they landed, the rows its
 * data holds over the input columns, and the rows its footer takes.
 */
export interface Placed {
  readonly layout: Layout;
  readonly sheet: SheetName;
  readonly columns: readonly Column[];
  readonly inputs: readonly Column[];
  readonly data: readonly DataRow[];
  readonly taken: Taken;
  readonly top: number;
  readonly depth: number;
  readonly bodyFirst: number;
  readonly bodyLast: number;
  readonly footer: readonly FooterLine[];
  readonly lastRow: number;
}

/**
 * Where the body's rows were read from: the file, `null` for `values:`, and for
 * a CSV the field each input column took, under its header row.
 */
export interface Taken {
  readonly file: FilePath | null;
  readonly picks: readonly number[] | null;
}

/** A layout column where it landed, a block's under its qualified name, with every header level above it. */
export interface Column {
  readonly name: string;
  readonly col: number;
  readonly scope: string | null;
  readonly field: string;
  readonly header: readonly (HeaderCell | null)[];
  readonly spec: LayoutColumn;
}

/** One footer row as it lands: its row, and the values of the groups around it. */
export interface FooterLine {
  readonly row: number;
  readonly entry: FooterRow;
  readonly keys: readonly (readonly [string, ScalarValue])[];
}

/** Where the column of that name landed, or `undefined` where the layout has none. */
export function colOf(
  of: { readonly columns: readonly Column[] },
  name: string,
): number | undefined {
  return of.columns.find((one) => one.name === name)?.col;
}

/** The first and last sheet columns a placed layout spans. */
export function edges(placed: Placed): { left: number; right: number } {
  const left = placed.columns[0]?.col ?? 1;
  return { left, right: placed.columns[placed.columns.length - 1]?.col ?? left };
}
