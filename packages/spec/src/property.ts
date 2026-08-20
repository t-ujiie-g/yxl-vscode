import type { Color } from '@yxl-vscode/units';
import type { BorderStyle, HAlign, VAlign } from './style';

/**
 * A look as the leaves it is made of — `font.bold`, `border.left.color` — which
 * layer per leaf, as `extends:` and a band do (`docs/spec.md` §4, §6).
 * `border.all` is expanded into its four sides.
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

/**
 * A look as one construct says it, or as a reader asks for it: a value, or
 * `null` where it says the attribute is not set (`docs/spec.md` §6). What a
 * cell finally looks like is `StyleValues`, where the two absences are one.
 */
export type StyleSays = { readonly [K in StyleProperty]?: StyleValues[K] | null };

/** Every leaf a look is made of, in the order a spec writes them. */
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

/**
 * The leaves a `style:` key covers — `font`, `border.left`, `fill` — for the
 * `null` that clears a whole group or one border edge at once
 * (`docs/spec.md` §6).
 */
export function propertiesUnder(key: string): StyleProperty[] {
  return STYLE_PROPERTIES.filter((one) => one === key || one.startsWith(`${key}.`));
}

/** The properties a look says something about, in the order the model declares them. */
export function propertiesOf(said: StyleSays): StyleProperty[] {
  return STYLE_PROPERTIES.filter((key) => said[key] !== undefined);
}

/**
 * The look in the order the model declares it, narrowed to the properties
 * named — the order that makes one look always the same bytes.
 */
export function ordered(
  said: StyleSays,
  keys: readonly StyleProperty[] = STYLE_PROPERTIES,
): StyleSays {
  const kept: Record<string, unknown> = {};
  for (const key of propertiesOf(said)) {
    if (keys.includes(key)) kept[key] = said[key];
  }

  return kept as StyleSays;
}
