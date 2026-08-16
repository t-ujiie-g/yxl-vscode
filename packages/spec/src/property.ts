import type { Color } from '@yxl-vscode/units';
import type { BorderStyle, HAlign, VAlign } from './style';

/**
 * A look as the leaves it is made of — `font.bold`, `border.left.color` — which
 * layer per leaf, as `extends:` and a band do (`docs/spec.md` §4, §6), and let
 * a layer record only what it contributed (ADR-005). `border.all` is expanded
 * into its four sides.
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

const STYLE_PROPERTIES = [
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
