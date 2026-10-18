import type { Node } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import { type Fit, type Margins, MODELED_KEYS, ORIENTATIONS, type Print } from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, identify, keyOf, reject } from './ctx';
import {
  type Opened,
  open,
  optional,
  optionalNumber,
  optionalText,
  readEach,
  scalarText,
} from './read';
import {
  ADDRESS,
  isLayoutName,
  type Kind,
  RANGE_OR_NAME,
  ROW,
  readAs,
  readTextAs,
  spelling,
} from './template';
import { say, under } from './text';

/** A sheet's `print:` setup (`docs/spec.md` §5). */
export function readPrint(ctx: Ctx, node: Node, what: Saying): Print | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.print);
  if (opened === null) return null;

  const scale = optionalNumber(opened, 'scale', what);
  const fit = optional(opened, 'fit', (entry) => readFit(opened.ctx, entry, under(what, 'fit')));
  if (scale !== null && fit !== null) {
    const why = say('loader.scales-two-ways', { what });
    reject(opened.ctx, CODE.conflictingKeys, why, opened.node.span);
  }

  return {
    ...identify(opened.ctx, opened.path, opened.node.span),
    area: optional(opened, 'area', (entry) =>
      readAs(opened.ctx, entry, under(what, 'area'), RANGE_OR_NAME),
    ),
    titles: optional(opened, 'titles', (entry) => readTitles(opened.ctx, entry, what)),
    orientation: optional(opened, 'orientation', (entry) =>
      readAs(opened.ctx, entry, under(what, 'orientation'), spelling(ORIENTATIONS)),
    ),
    margins: optional(opened, 'margins', (entry) =>
      readMargins(opened.ctx, entry, under(what, 'margins')),
    ),
    scale,
    fit,
    header: optionalText(opened, 'header', what),
    footer: optionalText(opened, 'footer', what),
    breaks: readBreaks(opened, what),
  };
}

/** A row, a `first-last` span or a layout's name, which a row may write as a number. */
const TITLE_ROWS: Kind<Print['titles'] & {}> = {
  ...ROW,
  noun: say('loader.rows-or-a-layout'),
  read: (text) => ROW.read(text) ?? (isLayoutName(text) ? { kind: 'named', text } : null),
};

/** `print.titles`: the rows repeated atop every page (`docs/spec.md` §5). */
function readTitles(ctx: Ctx, node: Node, of: Saying): Print['titles'] {
  const what = under(of, 'titles');
  const text = scalarText(node);
  if (text === null) return readAs(ctx, node, what, TITLE_ROWS);
  return readTextAs(ctx, text, node.span, what, TITLE_ROWS);
}

/** The cells a page starts at, each breaking above and left of itself; `A1` breaks nothing. */
function readBreaks(opened: Opened, what: Saying): Print['breaks'] {
  const found = opened.entries.find((entry) => keyOf(entry) === 'breaks');
  if (found === undefined) return [];

  const where = under(what, 'breaks');
  return readEach(opened.ctx, found.value, [...opened.path, 'breaks'], where, (site) => {
    const at = readAs(site.ctx, site.node, say('loader.one-of', { what: where }), ADDRESS);
    if (at !== 'A1') return at;

    reject(
      site.ctx,
      CODE.conflictingKeys,
      say('loader.break-at-a1', { what: where }),
      site.node.span,
    );
    return null;
  });
}

/** A `margins:` mapping, in the inches Excel measures them in; an unset edge keeps Excel's own. */
function readMargins(ctx: Ctx, node: Node, what: Saying): Margins | null {
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
function readFit(ctx: Ctx, node: Node, what: Saying): Fit | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.fit);
  if (opened === null) return null;

  return {
    width: optionalNumber(opened, 'width', what),
    height: optionalNumber(opened, 'height', what),
  };
}
