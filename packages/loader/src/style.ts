import type { Node } from '@yxl-vscode/cst';
import {
  type Align,
  BORDER_SIDES,
  BORDER_STYLES,
  type BorderEdge,
  type BorderSide,
  type Font,
  H_ALIGNS,
  MODELED_KEYS,
  type Protection,
  propertiesUnder,
  type Style,
  type StyleProperty,
  type StyleUse,
  V_ALIGNS,
} from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, keyOf, reject } from './ctx';
import {
  expectBool,
  expectNumber,
  expectSpelling,
  expectText,
  isCleared,
  openEntries,
  rejectUnknownKey,
} from './read';
import { COLOR, readAs, STYLE_NAME } from './template';

/** A `style:` key: a bareword naming a definition, or a style written in place. */
export function readStyleUse(ctx: Ctx, node: Node, what: string): StyleUse | null {
  if (node.kind === 'scalar') {
    const name = readAs(ctx, node, what, STYLE_NAME);
    return name === null ? null : { kind: 'ref', name };
  }

  const style = readStyle(ctx, node, what);
  return style === null ? null : { kind: 'inline', style };
}

/** A style written out in place, with each of its facets read (`docs/spec.md` §6). */
export function readStyle(ctx: Ctx, node: Node, what: string): Style | null {
  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;
  const here = opened.ctx;

  let base: Style['extends'] = null;
  let font: Font | null = null;
  let fill: Style['fill'] = null;
  let border: readonly BorderSide[] | null = null;
  let align: Align | null = null;
  let protection: Protection | null = null;
  let format: string | null = null;
  const cleared = new Set<StyleProperty>();

  for (const entry of opened.entries) {
    const key = keyOf(entry);
    const at = `${what} \`${key}\``;
    if (key !== 'extends' && isCleared(entry.value)) {
      clear(cleared, key);
      continue;
    }

    switch (key) {
      case 'extends':
        base = readAs(here, entry.value, at, STYLE_NAME);
        break;
      case 'font':
        font = readFont(here, entry.value, at, cleared);
        break;
      case 'fill':
        fill = readFill(here, entry.value, at);
        break;
      case 'border':
        border = readBorder(here, entry.value, at, cleared);
        break;
      case 'align':
        align = readAlign(here, entry.value, at, cleared);
        break;
      case 'protection':
        protection = readProtection(here, entry.value, at, cleared);
        break;
      case 'format':
        format = expectText(here, entry.value, at);
        break;
      default:
        rejectUnknownKey(here, entry, what, MODELED_KEYS.style);
    }
  }

  return { extends: base, font, fill, border, align, protection, format, cleared };
}

/** The leaves a key stands for, added to what the style says is not set; an unknown key adds nothing. */
function clear(cleared: Set<StyleProperty>, key: string, group = ''): void {
  for (const one of propertiesUnder(group === '' ? key : `${group}.${key}`)) cleared.add(one);
}

/** A `font:` mapping; a facet the spec leaves out is `undefined` rather than a default. */
export function readFont(
  ctx: Ctx,
  node: Node,
  what: string,
  cleared: Set<StyleProperty>,
): Font | null {
  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;
  const here = opened.ctx;

  let bold: boolean | null = null;
  let italic: boolean | null = null;
  let underline: boolean | null = null;
  let strike: boolean | null = null;
  let size: number | null = null;
  let name: string | null = null;
  let color: Font['color'] = null;

  for (const entry of opened.entries) {
    const key = keyOf(entry);
    const at = `${what} \`${key}\``;
    if (isCleared(entry.value) && MODELED_KEYS.font.has(key)) {
      clear(cleared, key, 'font');
      continue;
    }

    switch (key) {
      case 'bold':
        bold = expectBool(here, entry.value, at);
        break;
      case 'italic':
        italic = expectBool(here, entry.value, at);
        break;
      case 'underline':
        underline = expectBool(here, entry.value, at);
        break;
      case 'strike':
        strike = expectBool(here, entry.value, at);
        break;
      case 'size':
        size = expectNumber(here, entry.value, at);
        break;
      case 'name':
        name = expectText(here, entry.value, at);
        break;
      case 'color':
        color = readAs(here, entry.value, at, COLOR);
        break;
      default:
        rejectUnknownKey(here, entry, what, MODELED_KEYS.font);
    }
  }

  return { bold, italic, underline, strike, size, name, color };
}

/** A fill is its colour: the hex shorthand and the `{ color }` mapping are one thing. */
function readFill(ctx: Ctx, node: Node, what: string): Style['fill'] {
  if (node.kind === 'scalar') return readAs(ctx, node, what, COLOR);

  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;
  const here = opened.ctx;

  let color: Style['fill'] = null;
  for (const entry of opened.entries) {
    if (keyOf(entry) === 'color') {
      color = readAs(here, entry.value, `${what} \`color\``, COLOR);
    } else {
      rejectUnknownKey(here, entry, what, MODELED_KEYS.fill);
    }
  }

  if (color === null) reject(here, CODE.missingKey, `${what} needs a \`color\``, opened.node.span);
  return color;
}

function readBorder(
  ctx: Ctx,
  node: Node,
  what: string,
  cleared: Set<StyleProperty>,
): readonly BorderSide[] | null {
  if (node.kind === 'scalar') {
    const edge = readBorderEdge(ctx, node, what);
    return edge === null ? null : [{ side: 'all', edge }];
  }

  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;
  const here = opened.ctx;

  const sides: BorderSide[] = [];
  for (const entry of opened.entries) {
    const side = BORDER_SIDES.find((known) => known === keyOf(entry));
    if (side === undefined) {
      rejectUnknownKey(here, entry, what, MODELED_KEYS.border);
      continue;
    }
    // An edge is the unit a `null` takes away, so its `style` and `colour` go together.
    if (isCleared(entry.value)) {
      clear(cleared, side === 'all' ? 'border' : `border.${side}`);
      continue;
    }

    const edge = readBorderEdge(here, entry.value, `${what} \`${side}\``);
    if (edge !== null) sides.push({ side, edge });
  }

  return sides;
}

function readBorderEdge(ctx: Ctx, node: Node, what: string): BorderEdge | null {
  if (node.kind === 'scalar') {
    const style = expectSpelling(ctx, node, what, BORDER_STYLES);
    return style === null ? null : { style, color: null };
  }

  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;
  const here = opened.ctx;

  let style: BorderEdge['style'] | null = null;
  let color: BorderEdge['color'] = null;

  for (const entry of opened.entries) {
    const at = `${what} \`${keyOf(entry)}\``;
    switch (keyOf(entry)) {
      case 'style':
        style = expectSpelling(here, entry.value, at, BORDER_STYLES);
        break;
      case 'color':
        color = readAs(here, entry.value, at, COLOR);
        break;
      default:
        rejectUnknownKey(here, entry, what, MODELED_KEYS.borderEdge);
    }
  }

  if (style === null) {
    reject(here, CODE.missingKey, `${what} needs a \`style\``, opened.node.span);
    return null;
  }
  return { style, color };
}

function readAlign(ctx: Ctx, node: Node, what: string, cleared: Set<StyleProperty>): Align | null {
  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;
  const here = opened.ctx;

  let horizontal: Align['horizontal'] = null;
  let vertical: Align['vertical'] = null;
  let wrap: boolean | null = null;

  for (const entry of opened.entries) {
    const key = keyOf(entry);
    const at = `${what} \`${key}\``;
    if (isCleared(entry.value) && MODELED_KEYS.align.has(key)) {
      clear(cleared, key, 'align');
      continue;
    }

    switch (key) {
      case 'horizontal':
        horizontal = expectSpelling(here, entry.value, at, H_ALIGNS);
        break;
      case 'vertical':
        vertical = expectSpelling(here, entry.value, at, V_ALIGNS);
        break;
      case 'wrap':
        wrap = expectBool(here, entry.value, at);
        break;
      default:
        rejectUnknownKey(here, entry, what, MODELED_KEYS.align);
    }
  }

  return { horizontal, vertical, wrap };
}

function readProtection(
  ctx: Ctx,
  node: Node,
  what: string,
  cleared: Set<StyleProperty>,
): Protection | null {
  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;
  const here = opened.ctx;

  let locked: boolean | null = null;
  let hidden: boolean | null = null;

  for (const entry of opened.entries) {
    const key = keyOf(entry);
    const at = `${what} \`${key}\``;
    if (isCleared(entry.value) && MODELED_KEYS.protection.has(key)) {
      clear(cleared, key, 'protection');
      continue;
    }

    switch (key) {
      case 'locked':
        locked = expectBool(here, entry.value, at);
        break;
      case 'hidden':
        hidden = expectBool(here, entry.value, at);
        break;
      default:
        rejectUnknownKey(here, entry, what, MODELED_KEYS.protection);
    }
  }

  return { locked, hidden };
}
