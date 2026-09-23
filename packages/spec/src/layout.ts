import type { A1Addr } from '@yxl-vscode/units';
import type { CellFacets } from './cell';
import type { Conditional } from './conditional';
import type { DataSource } from './data';
import type { SpecNode, Templated } from './node';
import type { StyleUse } from './style';
import type { ScalarValue } from './value';

/**
 * One `layouts:` entry: named columns anchored at one cell, the body filled from
 * data, formulas written by column name (`docs/spec.md` §25).
 */
export interface Layout extends SpecNode {
  readonly at: Anchor;
  readonly name: string | null;
  readonly rows: number | null;
  readonly source: DataSource | null;
  readonly headerStyle: StyleUse | null;
  readonly columns: readonly LayoutEntry[];
  readonly footer: readonly FooterEntry[];
}

/** Where something anchored at a cell sits: a cell, or under a named layout on its sheet (`docs/spec.md` §25). */
export type Anchor = Templated<A1Addr> | Below;

/** `at: { below: layout, gap: n }` — `gap` blank rows under the layout's last row, in its first column. */
export interface Below {
  readonly kind: 'below';
  readonly layout: string;
  readonly gap: number;
}

/** A range written as a layout's name, `店舗`, or one column's body, `店舗.cy`; the compiler finds which. */
export interface Named {
  readonly kind: 'named';
  readonly text: string;
}

/** An entry of a layout's `columns:`: one column, or a block placed as several. */
export type LayoutEntry = LayoutColumn | BlockPlacement;

/**
 * One layout column: what the layout reads of it, and the band keys of §4 it
 * passes to its sheet column. `header` is its levels top first, `null` in the
 * list a deliberate blank; `formula` is written for the body's first row.
 */
export interface LayoutColumn extends SpecNode {
  readonly kind: 'column';
  readonly name: string;
  readonly field: string | null;
  readonly header: readonly (HeaderCell | null)[] | null;
  readonly formula: string | null;
  readonly conditional: readonly ColumnRule[];
  readonly width: number | null;
  readonly style: StyleUse | null;
  readonly format: string | null;
  readonly clearsFormat: boolean;
  readonly hidden: boolean | null;
  readonly group: number | null;
}

/** A header cell, written as any cell is (`docs/spec.md` §3). */
export interface HeaderCell extends SpecNode, CellFacets {}

/** A conditional format over one column's body, which takes no `at`. */
export type ColumnRule = Omit<Conditional, 'at'>;

/** `{ block: name, as, header, fields }` — a `defs.blocks` entry placed in a layout. */
export interface BlockPlacement extends SpecNode {
  readonly kind: 'block';
  readonly block: string;
  readonly as: string | null;
  readonly header: readonly (HeaderCell | null)[] | null;
  readonly fields: readonly (readonly [string, string])[];
}

/** One `defs.blocks` entry: a group of layout columns written once. */
export interface BlockDef extends SpecNode {
  readonly name: string;
  readonly columns: readonly LayoutColumn[];
}

/** One `footer:` entry: a row of cells by column name, or a group repeated per value of a column. */
export type FooterEntry = FooterRow | FooterGroup;

/** A footer row: its cells, and the style every cell across the layout wears. */
export interface FooterRow extends SpecNode {
  readonly kind: 'row';
  readonly cells: readonly FooterCell[];
  readonly style: StyleUse | null;
}

/**
 * One cell of a footer row, under the column it names. `total` aggregates the
 * column's body, and `mergeTo` names a column to its right the cell spans to.
 */
export interface FooterCell extends SpecNode, CellFacets {
  readonly column: string;
  readonly total: FooterTotal | null;
  readonly mergeTo: string | null;
}

/** What `{ total: … }` computes over a column's body. */
export const FOOTER_TOTALS = ['sum', 'count', 'average', 'min', 'max'] as const;

export type FooterTotal = (typeof FOOTER_TOTALS)[number];

/** `by:` a column the data fills, its values taken in `order`, with `rows` repeated for each. */
export interface FooterGroup extends SpecNode {
  readonly kind: 'group';
  readonly by: string;
  readonly order: GroupOrder;
  readonly rows: readonly FooterEntry[];
}

/** A group's order: as the data lists them, sorted, or a list that also says which get a row. */
export type GroupOrder =
  | { readonly kind: 'data' | 'asc' | 'desc' }
  | { readonly kind: 'listed'; readonly values: readonly ScalarValue[] };

/**
 * An override's `at:` given by meaning: a named layout's column, in the one
 * row whose input columns hold `where`, or the body's `row`th (`docs/spec.md` §25).
 */
export interface ByMeaning {
  readonly kind: 'layout';
  readonly layout: string;
  readonly column: string;
  readonly where: readonly (readonly [string, ScalarValue])[] | null;
  readonly row: number | null;
}
