import type { Node } from '@yxl-vscode/cst';
import { type Fit, type Margins, MODELED_KEYS, type Print } from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, identify, keyOf, reject } from './ctx';
import { type Opened, open, optional, optionalNumber, optionalText, readEach } from './read';
import { ADDRESS, ORIENTATION, RANGE, readAs } from './template';

/** A sheet's `print:` setup (`docs/spec.md` §5). */
export function readPrint(ctx: Ctx, node: Node, what: string): Print | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.print);
  if (opened === null) return null;

  const scale = optionalNumber(opened, 'scale', what);
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

  const read = (key: string): number | null => optionalNumber(opened, key, what);

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

  return {
    width: optionalNumber(opened, 'width', what),
    height: optionalNumber(opened, 'height', what),
  };
}
