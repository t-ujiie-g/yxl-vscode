import type { Node, Path } from '@yxl-vscode/cst';
import {
  CHART_TYPES,
  type Chart,
  type ChartAxis,
  type ChartSeries,
  type Image,
  LEGEND_PLACES,
  MODELED_KEYS,
  type PixelOffset,
  POSITIONINGS,
  type Positioning,
  type Scale,
  SHAPE_KINDS,
  type Shape,
  type ShapeLine,
  type ShapeText,
  type Size,
} from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, identify, keyOf, reject, type Site } from './ctx';
import {
  expectNumber,
  expectSpelling,
  expectText,
  findEntry,
  type Opened,
  openEntries,
  openSeq,
  readEach,
  rejectUnknownKey,
} from './read';
import { readFont } from './style';
import { ADDRESS, COLOR, PATH, readAs } from './template';

/** A sheet's `charts:` entries, in the order written (`docs/spec.md` §12). */
export function readCharts(ctx: Ctx, node: Node, path: Path): Chart[] {
  const what = 'a `charts` entry';

  return readEach(ctx, node, path, '`charts`', (site: Site) => {
    const opened = open(site, what, MODELED_KEYS.chart);
    if (opened === null) return null;

    const at = anchor(opened, what);
    const type = required(opened, 'type', what, (entry) =>
      expectSpelling(opened.ctx, entry, `${what} \`type\``, CHART_TYPES),
    );
    const series = readSeries(opened, what);
    if (at === null || type === null || series === null) return null;

    return {
      ...identify(opened.ctx, opened.path, opened.node.span),
      at,
      type,
      title: optionalText(opened, 'title', what),
      legend: optional(opened, 'legend', (entry) =>
        expectSpelling(opened.ctx, entry, `${what} \`legend\``, LEGEND_PLACES),
      ),
      size: optional(opened, 'size', (entry) => readSize(opened.ctx, entry, `${what} \`size\``)),
      xAxis: optional(opened, 'x_axis', (entry) =>
        readAxis(opened.ctx, entry, `${what} \`x_axis\``),
      ),
      yAxis: optional(opened, 'y_axis', (entry) =>
        readAxis(opened.ctx, entry, `${what} \`y_axis\``),
      ),
      series,
    };
  });
}

/** A chart's `series:`, which must hold at least one; a range is kept as written (`docs/spec.md` §12). */
function readSeries(opened: Opened, what: string): ChartSeries[] | null {
  const found = findEntry(opened.entries, 'series');
  if (found === undefined) {
    reject(opened.ctx, CODE.missingKey, `${what} needs a \`series\``, opened.node.span);
    return null;
  }

  const one = 'a `series` entry';
  const read = readEach(opened.ctx, found.value, [...opened.path, 'series'], one, (site) => {
    const here = open(site, one, MODELED_KEYS.chartSeries);
    if (here === null) return null;

    const values = required(here, 'values', one, (entry) =>
      expectText(here.ctx, entry, `${one} \`values\``),
    );
    if (values === null) return null;

    const name = optionalText(here, 'name', one);
    const nameFrom = optionalText(here, 'name_from', one);
    if (name !== null && nameFrom !== null) {
      const why = `${one} names itself twice: \`name\` and \`name_from\``;
      reject(here.ctx, CODE.conflictingKeys, why, here.node.span);
      return null;
    }

    return {
      ...identify(here.ctx, here.path, here.node.span),
      values,
      categories: optionalText(here, 'categories', one),
      name,
      nameFrom,
    };
  });

  if (read.length === 0) {
    reject(opened.ctx, CODE.missingKey, `${what} needs at least one series`, found.span);
    return null;
  }
  return read;
}

/** An `x_axis:` or `y_axis:` mapping (`docs/spec.md` §12). */
function readAxis(ctx: Ctx, node: Node, what: string): ChartAxis | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.chartAxis);
  if (opened === null) return null;

  return {
    title: optionalText(opened, 'title', what),
    min: optional(opened, 'min', (entry) => expectNumber(opened.ctx, entry, `${what} \`min\``)),
    max: optional(opened, 'max', (entry) => expectNumber(opened.ctx, entry, `${what} \`max\``)),
  };
}

/** A sheet's `images:` entries, in the order written (`docs/spec.md` §13). */
export function readImages(ctx: Ctx, node: Node, path: Path): Image[] {
  const what = 'an `images` entry';

  return readEach(ctx, node, path, '`images`', (site: Site) => {
    const opened = open(site, what, MODELED_KEYS.image);
    if (opened === null) return null;

    const at = anchor(opened, what);
    const path = required(opened, 'file', what, (entry) =>
      readAs(opened.ctx, entry, `${what} \`file\``, PATH),
    );
    if (at === null || path === null) return null;

    return {
      ...identify(opened.ctx, opened.path, opened.node.span),
      at,
      path,
      alt: optionalText(opened, 'alt', what),
      scale: optional(opened, 'scale', (entry) =>
        readScale(opened.ctx, entry, `${what} \`scale\``),
      ),
      offset: optional(opened, 'offset', (entry) =>
        readOffset(opened.ctx, entry, `${what} \`offset\``),
      ),
      positioning: positioned(opened, what),
    };
  });
}

/** A `scale:` written as one factor over both directions, or as one each (`docs/spec.md` §13). */
function readScale(ctx: Ctx, node: Node, what: string): Scale | null {
  if (node.kind === 'scalar') {
    const both = expectNumber(ctx, node, what);
    return both === null ? null : { x: both, y: both };
  }

  return readOffset(ctx, node, what);
}

/** An `offset:` or a two-axis `scale:`; both ends are required (`docs/spec.md` §13). */
function readOffset(ctx: Ctx, node: Node, what: string): PixelOffset | null {
  return readPair(ctx, node, what, ['x', 'y'], MODELED_KEYS.point);
}

/** A `size:` mapping, in whole pixels; both ends are required (`docs/spec.md` §12). */
function readSize(ctx: Ctx, node: Node, what: string): Size | null {
  const pair = readPair(ctx, node, what, ['width', 'height'], MODELED_KEYS.size);
  return pair === null ? null : { width: pair.x, height: pair.y };
}

function readPair(
  ctx: Ctx,
  node: Node,
  what: string,
  keys: readonly [string, string],
  known: ReadonlySet<string>,
): { x: number; y: number } | null {
  const opened = open({ ctx, node, path: [] }, what, known);
  if (opened === null) return null;

  const read = (key: string): number | null =>
    required(opened, key, what, (entry) => expectNumber(opened.ctx, entry, `${what} \`${key}\``));

  const x = read(keys[0]);
  const y = read(keys[1]);
  return x === null || y === null ? null : { x, y };
}

/** A sheet's `shapes:` entries, in the order written (`docs/spec.md` §18). */
export function readShapes(ctx: Ctx, node: Node, path: Path): Shape[] {
  const what = 'a `shapes` entry';

  return readEach(ctx, node, path, '`shapes`', (site: Site) => {
    const opened = open(site, what, MODELED_KEYS.shape);
    if (opened === null) return null;

    const at = anchor(opened, what);
    const kind = required(opened, 'kind', what, (entry) =>
      expectSpelling(opened.ctx, entry, `${what} \`kind\``, SHAPE_KINDS),
    );
    if (at === null || kind === null) return null;

    return {
      ...identify(opened.ctx, opened.path, opened.node.span),
      at,
      kind,
      text: readShapeText(opened, what),
      size: optional(opened, 'size', (entry) => readSize(opened.ctx, entry, `${what} \`size\``)),
      fill: optional(opened, 'fill', (entry) =>
        readAs(opened.ctx, entry, `${what} \`fill\``, COLOR),
      ),
      line: optional(opened, 'line', (entry) => readLine(opened.ctx, entry, `${what} \`line\``)),
      alt: optionalText(opened, 'alt', what),
      positioning: positioned(opened, what),
    };
  });
}

/** A shape's `text:`: one string, or a sequence whose lines each carry a font (`docs/spec.md` §18). */
function readShapeText(opened: Opened, what: string): ShapeText[] {
  const found = findEntry(opened.entries, 'text');
  if (found === undefined) return [];

  const where = `${what} \`text\``;
  if (found.value.kind !== 'seq') {
    const line = expectText(opened.ctx, found.value, where);
    return line === null ? [] : [{ text: line, font: null }];
  }

  const seq = openSeq(opened.ctx, found.value, [...opened.path, 'text'], where);
  if (seq === null) return [];

  const lines: ShapeText[] = [];
  for (const item of seq.node.items) {
    const line =
      item.kind === 'map' ? readShapeLine(seq.ctx, item, where) : plainLine(seq.ctx, item, where);
    if (line !== null) lines.push(line);
  }
  return lines;
}

function plainLine(ctx: Ctx, node: Node, where: string): ShapeText | null {
  const line = expectText(ctx, node, where);
  return line === null ? null : { text: line, font: null };
}

function readShapeLine(ctx: Ctx, node: Node, where: string): ShapeText | null {
  const here = open({ ctx, node, path: [] }, where, MODELED_KEYS.shapeText);
  if (here === null) return null;

  const text = required(here, 'text', where, (entry) =>
    expectText(here.ctx, entry, `${where} \`text\``),
  );
  if (text === null) return null;

  return {
    text,
    font: optional(here, 'font', (entry) =>
      readFont(here.ctx, entry, `${where} \`font\``, new Set()),
    ),
  };
}

/** A shape's `line:`: a bare hex colour, or the colour with a width in points (`docs/spec.md` §18). */
function readLine(ctx: Ctx, node: Node, what: string): ShapeLine | null {
  if (node.kind !== 'map') {
    const color = readAs(ctx, node, what, COLOR);
    return color === null ? null : { color, width: null };
  }

  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.shapeLine);
  if (opened === null) return null;

  const color = required(opened, 'color', what, (entry) =>
    readAs(opened.ctx, entry, `${what} \`color\``, COLOR),
  );
  if (color === null) return null;

  return {
    color,
    width: optional(opened, 'width', (entry) =>
      expectNumber(opened.ctx, entry, `${what} \`width\``),
    ),
  };
}

/** A mapping opened with every key the construct does not have reported (ADR-011). */
export function open(site: Site, what: string, known: ReadonlySet<string>): Opened | null {
  const opened = openEntries(site.ctx, site.node, site.path, what);
  if (opened === null) return null;

  for (const entry of opened.entries) {
    if (!known.has(keyOf(entry))) rejectUnknownKey(opened.ctx, entry, what, known);
  }
  return opened;
}

/** The `at` every float needs: the cell its top-left corner floats over. */
function anchor(opened: Opened, what: string): Chart['at'] | null {
  return required(opened, 'at', what, (entry) =>
    readAs(opened.ctx, entry, `${what} \`at\``, ADDRESS),
  );
}

function positioned(opened: Opened, what: string): Positioning | null {
  return optional(opened, 'positioning', (entry) =>
    expectSpelling(opened.ctx, entry, `${what} \`positioning\``, POSITIONINGS),
  );
}

/** A key the construct cannot be read without, reported by name where it is missing. */
export function required<T>(
  opened: Opened,
  key: string,
  what: string,
  read: (node: Node) => T | null,
): T | null {
  const found = findEntry(opened.entries, key);
  if (found === undefined) {
    reject(opened.ctx, CODE.missingKey, `${what} needs a \`${key}\``, opened.node.span);
    return null;
  }
  return read(found.value);
}

/** A key the spec leaves out far more often than it writes. */
export function optional<T>(opened: Opened, key: string, read: (node: Node) => T | null): T | null {
  const found = findEntry(opened.entries, key);
  return found === undefined ? null : read(found.value);
}

export function optionalText(opened: Opened, key: string, what: string): string | null {
  return optional(opened, key, (entry) => expectText(opened.ctx, entry, `${what} \`${key}\``));
}
