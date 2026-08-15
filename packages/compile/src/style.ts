import type {
  SpecNode,
  Style,
  StyleProperty,
  StyleUse,
  StyleValues,
  Templated,
} from '@yxl-vscode/spec';
import { type Color, type NodeId, parseColor, type StyleName } from '@yxl-vscode/units';
import { CODE } from './codes';
import { type Ctx, reject, text } from './ctx';

/**
 * How a look reaches a cell: which construct applies it, not which one holds it.
 *
 * A column band that names `header` gives `definition` layers reached
 * `through: 'column'`, because the two answers a resolver has to offer are
 * different — edit the definition, or edit the band (§4.4).
 */
export type StyleSource = 'column' | 'row' | 'cell' | 'override';

/**
 * One construct's contribution to how a cell looks, holding only the leaves it
 * set (ADR-005).
 *
 * Kept as a list rather than a resolved blob because the list *is* the candidate
 * generator: "bold because `defs.styles.header` says so, blue because column B
 * says so" is the same fact the resolution dialog needs to offer a choice.
 *
 * `name` is set when the layer is a `defs.styles` entry, which is what makes an
 * `extends:` chain readable — the base's layer comes first, under the style that
 * extends it.
 */
export interface StyleLayer {
  readonly through: StyleSource;
  readonly node: NodeId;
  readonly name: StyleName | null;
  readonly gives: StyleValues;
}

/** The look itself: every layer laid over the one before it. */
export function resolve(layers: readonly StyleLayer[]): StyleValues {
  const looks: Setting = {};
  for (const layer of layers) Object.assign(looks, layer.gives);
  return looks;
}

/**
 * The layers one construct contributes: what its `style:` says, and then its own
 * `format:` over that.
 *
 * A `format:` written beside a style reference layers over the style's own
 * (`docs/spec.md` §6), which is why it is a layer of its own rather than part of
 * the one before it.
 */
export function layersOf(
  ctx: Ctx,
  node: SpecNode,
  through: StyleSource,
  use: StyleUse | null,
  format: string | null,
): StyleLayer[] {
  const layers = use === null ? [] : fromUse(ctx, node, through, use, []);

  if (format !== null) {
    const code = text(ctx, format, node);
    layers.push({ through, node: node.id, name: null, gives: { format: code } });
  }
  return layers;
}

function fromUse(
  ctx: Ctx,
  node: SpecNode,
  through: StyleSource,
  use: StyleUse,
  chain: readonly string[],
): StyleLayer[] {
  if (use.kind === 'ref') {
    const name = text(ctx, use.name, node);
    return fromName(ctx, node, through, name, chain);
  }
  return fromStyle(ctx, node, through, use.style, null, chain);
}

/** A named definition: whatever it extends, under what it sets itself. */
function fromName(
  ctx: Ctx,
  node: SpecNode,
  through: StyleSource,
  name: string,
  chain: readonly string[],
): StyleLayer[] {
  if (chain.includes(name)) {
    const loop = [...chain, name].join(' → ');
    reject(ctx, CODE.styleCycle, `a style extends its way back round: ${loop}`, node);
    return [];
  }

  const def = ctx.styles.get(name);
  if (def === undefined) {
    reject(ctx, CODE.unknownStyle, `no style is declared as \`${name}\``, node);
    return [];
  }

  return fromStyle(ctx, def, through, def.style, def.name, [...chain, name]);
}

function fromStyle(
  ctx: Ctx,
  node: SpecNode,
  through: StyleSource,
  style: Style,
  name: StyleName | null,
  chain: readonly string[],
): StyleLayer[] {
  const base =
    style.extends === null
      ? []
      : fromName(ctx, node, through, text(ctx, style.extends, node), chain);

  return [...base, { through, node: node.id, name, gives: flatten(ctx, style, node) }];
}

const EDGES = ['left', 'right', 'top', 'bottom'] as const;

type Setting = { -readonly [K in StyleProperty]?: StyleValues[K] };

/** A style as the leaves it sets, with `border: all` spread over the four sides. */
function flatten(ctx: Ctx, style: Style, node: SpecNode): StyleValues {
  const values: Setting = {};

  function set<K extends StyleProperty>(key: K, value: StyleValues[K] | null | undefined): void {
    if (value !== null && value !== undefined) values[key] = value;
  }

  function colour(of: Templated<Color> | null): Color | undefined {
    if (of === null) return undefined;

    const spelled = text(ctx, of, node);
    const read = parseColor(spelled);
    if (read === null) reject(ctx, CODE.badColour, `\`${spelled}\` is not a hex colour`, node);
    return read ?? undefined;
  }

  set('font.bold', style.font?.bold);
  set('font.italic', style.font?.italic);
  set('font.underline', style.font?.underline);
  set('font.strike', style.font?.strike);
  set('font.size', style.font?.size);
  set('font.name', style.font?.name);
  set('font.color', colour(style.font?.color ?? null));
  set('fill', colour(style.fill));
  set('align.horizontal', style.align?.horizontal);
  set('align.vertical', style.align?.vertical);
  set('align.wrap', style.align?.wrap);
  set('protection.locked', style.protection?.locked);
  set('protection.hidden', style.protection?.hidden);
  set('format', style.format === null ? undefined : text(ctx, style.format, node));

  for (const side of style.border ?? []) {
    for (const edge of side.side === 'all' ? EDGES : [side.side]) {
      set(`border.${edge}.style`, side.edge.style);
      set(`border.${edge}.color`, colour(side.edge.color));
    }
  }

  return values;
}
