import type { Node } from '@yxl-vscode/cst';
import {
  ALLOWANCES,
  type Allowance,
  type Fit,
  type Margins,
  MODELED_KEYS,
  type Print,
  type Protect,
} from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, identify, keyOf, reject } from './ctx';
import {
  expectBool,
  expectNumber,
  type Opened,
  open,
  optional,
  optionalText,
  readEach,
} from './read';
import { ADDRESS, ORIENTATION, RANGE, readAs } from './template';

/** A sheet's `print:` setup (`docs/spec.md` §5). */
export function readPrint(ctx: Ctx, node: Node, what: string): Print | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.print);
  if (opened === null) return null;

  const scale = optional(opened, 'scale', (entry) =>
    expectNumber(opened.ctx, entry, `${what} \`scale\``),
  );
  const fit = optional(opened, 'fit', (entry) => readFit(opened.ctx, entry, `${what} \`fit\``));
  if (scale !== null && fit !== null) {
    const why = `${what} scales two ways at once: \`scale\` and \`fit\``;
    reject(opened.ctx, CODE.conflictingKeys, why, opened.node.span);
  }

  return {
    ...identify(opened.ctx, opened.path, opened.node.span),
    area: optional(opened, 'area', (entry) => readAs(opened.ctx, entry, `${what} \`area\``, RANGE)),
    orientation: optional(opened, 'orientation', (entry) =>
      readAs(opened.ctx, entry, `${what} \`orientation\``, ORIENTATION),
    ),
    margins: optional(opened, 'margins', (entry) =>
      readMargins(opened.ctx, entry, `${what} \`margins\``),
    ),
    scale,
    fit,
    header: optionalText(opened, 'header', what),
    footer: optionalText(opened, 'footer', what),
    breaks: readBreaks(opened, what),
  };
}

/** The cells a page starts at, each breaking above and left of itself; `A1` breaks nothing. */
function readBreaks(opened: Opened, what: string): Print['breaks'] {
  const found = opened.entries.find((entry) => keyOf(entry) === 'breaks');
  if (found === undefined) return [];

  const where = `${what} \`breaks\``;
  return readEach(opened.ctx, found.value, [...opened.path, 'breaks'], where, (site) => {
    const at = readAs(site.ctx, site.node, `a ${where} entry`, ADDRESS);
    if (at !== 'A1') return at;

    reject(site.ctx, CODE.conflictingKeys, `${where} at \`A1\` breaks nothing`, site.node.span);
    return null;
  });
}

/** A `margins:` mapping, in the inches Excel measures them in; an unset edge keeps Excel's own. */
function readMargins(ctx: Ctx, node: Node, what: string): Margins | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.margins);
  if (opened === null) return null;

  const read = (key: string): number | null =>
    optional(opened, key, (entry) => expectNumber(opened.ctx, entry, `${what} \`${key}\``));

  return {
    top: read('top'),
    bottom: read('bottom'),
    left: read('left'),
    right: read('right'),
    header: read('header'),
    footer: read('footer'),
  };
}

/** A `fit:` mapping: how many pages across and down, `0` leaving that axis alone. */
function readFit(ctx: Ctx, node: Node, what: string): Fit | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.fit);
  if (opened === null) return null;

  const read = (key: 'width' | 'height'): number | null =>
    optional(opened, key, (entry) => expectNumber(opened.ctx, entry, `${what} \`${key}\``));

  return { width: read('width'), height: read('height') };
}

/** A sheet's `protect:` (`docs/spec.md` §16). */
export function readProtect(ctx: Ctx, node: Node, what: string): Protect | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.protect);
  if (opened === null) return null;

  return {
    ...identify(opened.ctx, opened.path, opened.node.span),
    password: optionalText(opened, 'password', what),
    allow:
      optional(opened, 'allow', (entry) => readAllow(opened.ctx, entry, `${what} \`allow\``)) ?? {},
  };
}

/** An `allow:` mapping; a misspelt name is reported rather than kept as a permission that never applies. */
function readAllow(ctx: Ctx, node: Node, what: string): Protect['allow'] | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.allow);
  if (opened === null) return null;

  const allow: { [K in Allowance]?: boolean } = {};
  for (const name of ALLOWANCES) {
    const said = optional(opened, name, (entry) =>
      expectBool(opened.ctx, entry, `${what} \`${name}\``),
    );
    if (said !== null) allow[name] = said;
  }

  return allow;
}
