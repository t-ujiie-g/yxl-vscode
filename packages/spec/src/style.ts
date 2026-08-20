import type { Color, StyleName } from '@yxl-vscode/units';
import type { Templated } from './node';
import type { StyleProperty } from './property';

/** The line styles a border edge may take. */
export const BORDER_STYLES = [
  'thin',
  'medium',
  'thick',
  'dashed',
  'dotted',
  'double',
  'hair',
] as const;

export type BorderStyle = (typeof BORDER_STYLES)[number];

/** The horizontal alignments a cell may take. */
export const H_ALIGNS = ['left', 'center', 'right', 'fill', 'justify', 'distributed'] as const;

export type HAlign = (typeof H_ALIGNS)[number];

/** The vertical alignments a cell may take. */
export const V_ALIGNS = ['top', 'middle', 'bottom', 'justify', 'distributed'] as const;

export type VAlign = (typeof V_ALIGNS)[number];

/** How a look reaches a cell or a band: by a `defs.styles` name, or written inline. */
export type StyleUse =
  | { readonly kind: 'ref'; readonly name: Templated<StyleName> }
  | { readonly kind: 'inline'; readonly style: Style };

/**
 * A look as a spec writes one (`docs/spec.md` §6). A `null` field is an absent
 * key, which inherits — not `false`, which overrides; `cleared` names the
 * attributes the style writes `null` at, which inherit nothing.
 */
export interface Style {
  readonly extends: Templated<StyleName> | null;
  readonly font: Font | null;
  readonly fill: Templated<Color> | null;
  readonly border: readonly BorderSide[] | null;
  readonly align: Align | null;
  readonly protection: Protection | null;
  readonly format: string | null;
  readonly cleared: ReadonlySet<StyleProperty>;
}

/** A font, in the parts a spec may set independently. */
export interface Font {
  readonly bold: boolean | null;
  readonly italic: boolean | null;
  readonly underline: boolean | null;
  readonly strike: boolean | null;
  readonly size: number | null;
  readonly name: string | null;
  readonly color: Templated<Color> | null;
}

/** The sides a border may name; `all` sets the other four at once. */
export const BORDER_SIDES = ['all', 'left', 'right', 'top', 'bottom'] as const;

export type BorderSideName = (typeof BORDER_SIDES)[number];

/**
 * One side of a border as written; `border: thin` is a single `all`. Sides stay
 * in written order because a later one overwrites an earlier one.
 */
export interface BorderSide {
  readonly side: BorderSideName;
  readonly edge: BorderEdge;
}

/** One edge: a line style, and the colour it is drawn in when the spec sets one. */
export interface BorderEdge {
  readonly style: BorderStyle;
  readonly color: Templated<Color> | null;
}

/** Where the content sits in the cell, and whether it wraps. */
export interface Align {
  readonly horizontal: HAlign | null;
  readonly vertical: VAlign | null;
  readonly wrap: boolean | null;
}

/** What sheet protection does to a cell wearing this style (`docs/spec.md` §16). */
export interface Protection {
  readonly locked: boolean | null;
  readonly hidden: boolean | null;
}
