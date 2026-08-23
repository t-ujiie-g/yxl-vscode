import {
  BORDER_EDGES,
  type SpecNode,
  STYLE_PROPERTIES,
  type Style,
  type StyleProperty,
  type StyleSays,
  type StyleUse,
  type StyleValues,
  type Templated,
} from '@yxl-vscode/spec';
import { type Color, type NodeId, parseColor, type StyleName } from '@yxl-vscode/units';
import { CODE } from './codes';
import { type Ctx, reject, text } from './ctx';

/** How a look reaches a cell — which construct applies it, which is a different edit from which one holds it. */
export type StyleSource = 'column' | 'row' | 'cell' | 'override' | 'conditional';

/** Which key of that construct set it: its `style:`, or the `format:` written beside it (`docs/spec.md` §4). */
export type StyleKey = 'style' | 'format';

/**
 * One construct's contribution to how a cell looks, only the leaves it set
 * (ADR-005). `name` is set for a `defs.styles` entry; a base's layer comes
 * before the style that extends it.
 */
export interface StyleLayer {
  readonly through: StyleSource;
  readonly key: StyleKey;
  readonly node: NodeId;
  readonly name: StyleName | null;
  readonly gives: StyleSays;
}

/** What every layer laid over the one before it says, `null` where the last word takes it away. */
export function resolve(layers: readonly StyleLayer[]): StyleSays {
  const said: Saying = {};
  for (const layer of layers) Object.assign(said, layer.gives);
  return said;
}

/** A look as a cell wears it: what is not set and what is explicitly not set are one cell. */
export function settled(said: StyleSays): StyleValues {
  const look: Setting = {};
  for (const key of STYLE_PROPERTIES) {
    const value = said[key];
    if (value !== undefined && value !== null) look[key] = value as never;
  }
  return look;
}

/** The layers one construct contributes: its `style:`, then its own `format:` over that (`docs/spec.md` §6). */
export function layersOf(
  ctx: Ctx,
  node: SpecNode,
  through: StyleSource,
  use: StyleUse | null,
  format: string | null,
  clearsFormat = false,
): StyleLayer[] {
  const layers = use === null ? [] : fromUse(ctx, node, through, use, []);
  const said = (gives: StyleSays) =>
    layers.push({ through, key: 'format', node: node.id, name: null, gives });

  if (format !== null) said({ format: text(ctx, format, node) });
  // A value beside it wins, whichever said which: the two states are exclusive.
  else if (clearsFormat && resolve(layers).format === undefined) said({ format: null });

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

  return [
    ...base,
    { through, key: 'style', node: node.id, name, gives: flatten(ctx, style, node) },
  ];
}

type Setting = { -readonly [K in StyleProperty]?: StyleValues[K] };

type Saying = { -readonly [K in StyleProperty]?: StyleValues[K] | null };

/** A style as the leaves it sets, with `border: all` spread over its four sides and every template resolved. */
export function flatten(ctx: Ctx, style: Style, node: SpecNode): StyleSays {
  const values: Saying = {};
  for (const key of style.cleared) values[key] = null;

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
    for (const edge of side.side === 'all' ? BORDER_EDGES : [side.side]) {
      set(`border.${edge}.style`, side.edge.style);
      set(`border.${edge}.color`, colour(side.edge.color));
    }
  }

  return values;
}
