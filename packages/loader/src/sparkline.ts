import type { Node, Path } from '@yxl-vscode/cst';
import {
  MODELED_KEYS,
  SPARKLINE_TYPES,
  type Sparkline,
  type SparklineColors,
  type SparklineGroup,
} from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, identify, reject, type Site } from './ctx';

import {
  findEntry,
  flag,
  type Opened,
  open,
  optional,
  optionalNumber,
  optionalText,
  readEach,
  required,
} from './read';
import { ADDRESS, COLOR, readAs, spelling } from './template';

/** A sheet's `sparklines:` entries, one group each, in the order written (`docs/spec.md` §19). */
export function readSparklines(ctx: Ctx, node: Node, path: Path): SparklineGroup[] {
  const what = 'a `sparklines` entry';

  return readEach(ctx, node, path, '`sparklines`', (site: Site) => {
    const opened = open(site, what, MODELED_KEYS.sparkline);
    if (opened === null) return null;

    const cells = placed(opened, what);
    if (cells === null) return null;

    return {
      ...identify(opened.ctx, opened.path, opened.node.span),
      cells,
      type:
        optional(opened, 'type', (entry) =>
          readAs(opened.ctx, entry, `${what} \`type\``, spelling(SPARKLINE_TYPES)),
        ) ?? 'line',
      markers: flag(opened, 'markers', what),
      high: flag(opened, 'high', what),
      low: flag(opened, 'low', what),
      min: optionalNumber(opened, 'min', what),
      max: optionalNumber(opened, 'max', what),
      weight: optionalNumber(opened, 'weight', what),
      color: optional(opened, 'color', (entry) =>
        readAs(opened.ctx, entry, `${what} \`color\``, COLOR),
      ),
      colors: optional(opened, 'colors', (entry) =>
        readColors(opened.ctx, entry, `${what} \`colors\``),
      ),
      axis: flag(opened, 'axis', what),
    };
  });
}

/** A group is placed one way or the other: one `at`/`data` pair, or a `cells` sequence of them. */
function placed(opened: Opened, what: string): Sparkline[] | null {
  const listed = findEntry(opened.entries, 'cells');
  const alone = findEntry(opened.entries, 'at');

  if (listed !== undefined && alone !== undefined) {
    const why = `${what} is placed twice: \`at\` and \`cells\``;
    reject(opened.ctx, CODE.conflictingKeys, why, opened.node.span);
    return null;
  }

  if (listed === undefined) {
    const one = readOne(opened, what);
    return one === null ? null : [one];
  }

  const each = 'a `cells` entry';
  const read = readEach(opened.ctx, listed.value, [...opened.path, 'cells'], each, (site) => {
    const here = open(site, each, MODELED_KEYS.sparklineCell);
    return here === null ? null : readOne(here, each);
  });

  if (read.length === 0) {
    reject(opened.ctx, CODE.missingKey, `${what} needs a sparkline to place`, listed.span);
    return null;
  }
  return read;
}

/** One sparkline: the cell it sits in, and the cells it plots, kept as written since it may name a sheet. */
function readOne(opened: Opened, what: string): Sparkline | null {
  const at = required(opened, 'at', what, (entry) =>
    readAs(opened.ctx, entry, `${what} \`at\``, ADDRESS),
  );
  const data = optionalText(opened, 'data', what);
  if (at === null) return null;

  if (data === null) {
    reject(opened.ctx, CODE.missingKey, `${what} needs a \`data\``, opened.node.span);
    return null;
  }
  return { at, data };
}

/** A `colors:` mapping, for the marks a sparkline can pick out (`docs/spec.md` §19). */
function readColors(ctx: Ctx, node: Node, what: string): SparklineColors | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.sparklineColors);
  if (opened === null) return null;

  const read = (key: 'markers' | 'high' | 'low'): SparklineColors['high'] =>
    optional(opened, key, (entry) => readAs(opened.ctx, entry, `${what} \`${key}\``, COLOR));

  return { markers: read('markers'), high: read('high'), low: read('low') };
}
