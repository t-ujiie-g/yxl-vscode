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
  type Style,
  type StyleUse,
  V_ALIGNS,
} from '@yxl-vscode/spec';
import { CODE } from './codes';
import {
  type Ctx,
  entriesOf,
  expectBool,
  expectMap,
  expectNumber,
  expectSpelling,
  expectText,
  keyOf,
  reject,
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

export function readStyle(ctx: Ctx, node: Node, what: string): Style | null {
  const map = expectMap(ctx, node, what);
  if (map === null) return null;

  let base: Style['extends'] = null;
  let font: Font | null = null;
  let fill: Style['fill'] = null;
  let border: readonly BorderSide[] | null = null;
  let align: Align | null = null;
  let protection: Protection | null = null;
  let format: string | null = null;

  for (const entry of entriesOf(ctx, map)) {
    const at = `${what} \`${keyOf(entry)}\``;
    switch (keyOf(entry)) {
      case 'extends':
        base = readAs(ctx, entry.value, at, STYLE_NAME);
        break;
      case 'font':
        font = readFont(ctx, entry.value, at);
        break;
      case 'fill':
        fill = readFill(ctx, entry.value, at);
        break;
      case 'border':
        border = readBorder(ctx, entry.value, at);
        break;
      case 'align':
        align = readAlign(ctx, entry.value, at);
        break;
      case 'protection':
        protection = readProtection(ctx, entry.value, at);
        break;
      case 'format':
        format = expectText(ctx, entry.value, at);
        break;
      default:
        rejectUnknownKey(ctx, entry, what, MODELED_KEYS.style);
    }
  }

  return { extends: base, font, fill, border, align, protection, format };
}

export function readFont(ctx: Ctx, node: Node, what: string): Font | null {
  const map = expectMap(ctx, node, what);
  if (map === null) return null;

  let bold: boolean | null = null;
  let italic: boolean | null = null;
  let underline: boolean | null = null;
  let strike: boolean | null = null;
  let size: number | null = null;
  let name: string | null = null;
  let color: Font['color'] = null;

  for (const entry of entriesOf(ctx, map)) {
    const at = `${what} \`${keyOf(entry)}\``;
    switch (keyOf(entry)) {
      case 'bold':
        bold = expectBool(ctx, entry.value, at);
        break;
      case 'italic':
        italic = expectBool(ctx, entry.value, at);
        break;
      case 'underline':
        underline = expectBool(ctx, entry.value, at);
        break;
      case 'strike':
        strike = expectBool(ctx, entry.value, at);
        break;
      case 'size':
        size = expectNumber(ctx, entry.value, at);
        break;
      case 'name':
        name = expectText(ctx, entry.value, at);
        break;
      case 'color':
        color = readAs(ctx, entry.value, at, COLOR);
        break;
      default:
        rejectUnknownKey(ctx, entry, what, MODELED_KEYS.font);
    }
  }

  return { bold, italic, underline, strike, size, name, color };
}

/** A fill is its colour: the hex shorthand and the `{ color }` mapping are one thing. */
function readFill(ctx: Ctx, node: Node, what: string): Style['fill'] {
  if (node.kind === 'scalar') return readAs(ctx, node, what, COLOR);

  const map = expectMap(ctx, node, what);
  if (map === null) return null;

  let color: Style['fill'] = null;
  for (const entry of entriesOf(ctx, map)) {
    if (keyOf(entry) === 'color') {
      color = readAs(ctx, entry.value, `${what} \`color\``, COLOR);
    } else {
      rejectUnknownKey(ctx, entry, what, MODELED_KEYS.fill);
    }
  }

  if (color === null) reject(ctx, CODE.missingKey, `${what} needs a \`color\``, node.span);
  return color;
}

function readBorder(ctx: Ctx, node: Node, what: string): readonly BorderSide[] | null {
  if (node.kind === 'scalar') {
    const edge = readBorderEdge(ctx, node, what);
    return edge === null ? null : [{ side: 'all', edge }];
  }

  const map = expectMap(ctx, node, what);
  if (map === null) return null;

  const sides: BorderSide[] = [];
  for (const entry of entriesOf(ctx, map)) {
    const side = BORDER_SIDES.find((known) => known === keyOf(entry));
    if (side === undefined) {
      rejectUnknownKey(ctx, entry, what, MODELED_KEYS.border);
      continue;
    }
    const edge = readBorderEdge(ctx, entry.value, `${what} \`${side}\``);
    if (edge !== null) sides.push({ side, edge });
  }

  return sides;
}

function readBorderEdge(ctx: Ctx, node: Node, what: string): BorderEdge | null {
  if (node.kind === 'scalar') {
    const style = expectSpelling(ctx, node, what, BORDER_STYLES);
    return style === null ? null : { style, color: null };
  }

  const map = expectMap(ctx, node, what);
  if (map === null) return null;

  let style: BorderEdge['style'] | null = null;
  let color: BorderEdge['color'] = null;

  for (const entry of entriesOf(ctx, map)) {
    const at = `${what} \`${keyOf(entry)}\``;
    switch (keyOf(entry)) {
      case 'style':
        style = expectSpelling(ctx, entry.value, at, BORDER_STYLES);
        break;
      case 'color':
        color = readAs(ctx, entry.value, at, COLOR);
        break;
      default:
        rejectUnknownKey(ctx, entry, what, MODELED_KEYS.borderEdge);
    }
  }

  if (style === null) {
    reject(ctx, CODE.missingKey, `${what} needs a \`style\``, node.span);
    return null;
  }
  return { style, color };
}

function readAlign(ctx: Ctx, node: Node, what: string): Align | null {
  const map = expectMap(ctx, node, what);
  if (map === null) return null;

  let horizontal: Align['horizontal'] = null;
  let vertical: Align['vertical'] = null;
  let wrap: boolean | null = null;

  for (const entry of entriesOf(ctx, map)) {
    const at = `${what} \`${keyOf(entry)}\``;
    switch (keyOf(entry)) {
      case 'horizontal':
        horizontal = expectSpelling(ctx, entry.value, at, H_ALIGNS);
        break;
      case 'vertical':
        vertical = expectSpelling(ctx, entry.value, at, V_ALIGNS);
        break;
      case 'wrap':
        wrap = expectBool(ctx, entry.value, at);
        break;
      default:
        rejectUnknownKey(ctx, entry, what, MODELED_KEYS.align);
    }
  }

  return { horizontal, vertical, wrap };
}

function readProtection(ctx: Ctx, node: Node, what: string): Protection | null {
  const map = expectMap(ctx, node, what);
  if (map === null) return null;

  let locked: boolean | null = null;
  let hidden: boolean | null = null;

  for (const entry of entriesOf(ctx, map)) {
    const at = `${what} \`${keyOf(entry)}\``;
    switch (keyOf(entry)) {
      case 'locked':
        locked = expectBool(ctx, entry.value, at);
        break;
      case 'hidden':
        hidden = expectBool(ctx, entry.value, at);
        break;
      default:
        rejectUnknownKey(ctx, entry, what, MODELED_KEYS.protection);
    }
  }

  return { locked, hidden };
}
