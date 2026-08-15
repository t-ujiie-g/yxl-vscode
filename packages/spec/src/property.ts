import type { Color } from '@yxl-vscode/units';
import type { BorderStyle, HAlign, VAlign } from './style';

/**
 * A look as the *leaves* it is made of, named by the path that reaches them in
 * a spec: `font.bold`, `border.left.color`.
 *
 * A `Style` says how a spec writes a look; this says what a look is worth
 * arguing about. Two of them layer per leaf, which is exactly what `extends:`
 * and a band do (`docs/spec.md` §4, §6) — a child setting `font.bold` keeps the
 * base's face and size — and it is what lets a layer record *only* what it
 * contributed (ADR-005).
 *
 * `border.all` is not here: it is a shorthand for the four sides, and keeping it
 * would mean every reader of a border had to know that.
 */
export interface StyleValues {
  readonly 'font.bold'?: boolean;
  readonly 'font.italic'?: boolean;
  readonly 'font.underline'?: boolean;
  readonly 'font.strike'?: boolean;
  readonly 'font.size'?: number;
  readonly 'font.name'?: string;
  readonly 'font.color'?: Color;
  readonly fill?: Color;
  readonly 'border.left.style'?: BorderStyle;
  readonly 'border.left.color'?: Color;
  readonly 'border.right.style'?: BorderStyle;
  readonly 'border.right.color'?: Color;
  readonly 'border.top.style'?: BorderStyle;
  readonly 'border.top.color'?: Color;
  readonly 'border.bottom.style'?: BorderStyle;
  readonly 'border.bottom.color'?: Color;
  readonly 'align.horizontal'?: HAlign;
  readonly 'align.vertical'?: VAlign;
  readonly 'align.wrap'?: boolean;
  readonly 'protection.locked'?: boolean;
  readonly 'protection.hidden'?: boolean;
  readonly format?: string;
}

/** Every leaf, for a reader that wants to walk them rather than name one. */
export const STYLE_PROPERTIES = [
  'font.bold',
  'font.italic',
  'font.underline',
  'font.strike',
  'font.size',
  'font.name',
  'font.color',
  'fill',
  'border.left.style',
  'border.left.color',
  'border.right.style',
  'border.right.color',
  'border.top.style',
  'border.top.color',
  'border.bottom.style',
  'border.bottom.color',
  'align.horizontal',
  'align.vertical',
  'align.wrap',
  'protection.locked',
  'protection.hidden',
  'format',
] as const;

export type StyleProperty = (typeof STYLE_PROPERTIES)[number];
