import {
  CHART_TYPES,
  type Chart,
  type ChartAxis,
  type Image,
  LEGEND_PLACES,
  POSITIONINGS,
  type Positioning,
  SHAPE_KINDS,
  type Shape,
  type ShapeText,
  SPARKLINE_TYPES,
  type Sparkline,
  type SparklineGroup,
  type SpecNode,
  type Style,
} from '@yxl-vscode/spec';
import { parseQualifiedCell, parseQualifiedRange, rectOf } from '@yxl-vscode/units';
import { address, colour, spelling } from './cell';
import { CODE } from './codes';
import { type Ctx, reject, text } from './ctx';
import type {
  CompiledChart,
  CompiledChartAxis,
  CompiledImage,
  CompiledSeries,
  CompiledShape,
  CompiledShapeText,
  CompiledSparkline,
} from './grid';
import { flatten, settled } from './style';

/** One `charts:` entry, its anchor read; what it plots stays the spec's own words (ADR-029). */
export function chart(ctx: Ctx, one: Chart): CompiledChart | null {
  const at = address(ctx, one.at, one);
  const type = spelling(ctx, one.type, CHART_TYPES, one);
  if (at === null || type === null) return null;

  return {
    at,
    type,
    title: one.title === null ? null : text(ctx, one.title, one),
    legend: one.legend === null ? null : spelling(ctx, one.legend, LEGEND_PLACES, one),
    size: one.size,
    xAxis: axis(ctx, one, one.xAxis),
    yAxis: axis(ctx, one, one.yAxis),
    series: one.series.map((each): CompiledSeries => {
      const spelled = each.nameFrom === null ? null : text(ctx, each.nameFrom, each);
      const from = spelled === null ? null : parseQualifiedCell(spelled);
      if (spelled !== null && from === null) {
        reject(ctx, CODE.badAddress, `\`${spelled}\` is not a cell reference`, each);
      }

      return {
        values: text(ctx, each.values, each),
        categories: each.categories === null ? null : text(ctx, each.categories, each),
        name: each.name === null ? null : text(ctx, each.name, each),
        nameFrom: from,
        node: each.id,
      };
    }),
    node: one.id,
  };
}

function axis(ctx: Ctx, one: Chart, written: ChartAxis | null): CompiledChartAxis | null {
  if (written === null) return null;

  return {
    title: written.title === null ? null : text(ctx, written.title, one),
    min: written.min,
    max: written.max,
  };
}

/** One `images:` entry, its anchor read; how big the file is, is the host's to say (ADR-004). */
export function image(ctx: Ctx, one: Image): CompiledImage | null {
  const at = address(ctx, one.at, one);
  if (at === null) return null;

  const spelled = text(ctx, one.path, one);
  return {
    at,
    path: spelled,
    alt: one.alt === null ? null : text(ctx, one.alt, one),
    scale: one.scale ?? { x: 1, y: 1 },
    offset: one.offset ?? { x: 0, y: 0 },
    positioning: positioned(ctx, one.positioning, one),
    node: one.id,
  };
}

/** A shape unsized is 160 × 160 (`docs/spec.md` §18). */
const SHAPE_SIZE = { width: 160, height: 160 };

/** One `shapes:` entry, its anchor, colours and text read (`docs/spec.md` §18). */
export function shape(ctx: Ctx, one: Shape): CompiledShape | null {
  const at = address(ctx, one.at, one);
  const kind = spelling(ctx, one.kind, SHAPE_KINDS, one);
  if (at === null || kind === null) return null;

  return {
    at,
    kind,
    text: one.text.map((line): CompiledShapeText => wording(ctx, one, line)),
    size: one.size ?? SHAPE_SIZE,
    fill: one.fill === null ? null : colour(ctx, one.fill, one),
    line:
      one.line === null ? null : { color: colour(ctx, one.line.color, one), width: one.line.width },
    alt: one.alt === null ? null : text(ctx, one.alt, one),
    positioning: positioned(ctx, one.positioning, one),
    node: one.id,
  };
}

/** What a float does when the cells beneath it change; `move` where the spec is silent (`docs/spec.md` §13). */
function positioned(ctx: Ctx, said: Image['positioning'], node: SpecNode): Positioning {
  if (said === null) return 'move';
  return spelling(ctx, said, POSITIONINGS, node) ?? 'move';
}

function wording(ctx: Ctx, one: Shape, line: ShapeText): CompiledShapeText {
  const style: Style = {
    extends: null,
    font: line.font,
    fill: null,
    border: null,
    align: null,
    protection: null,
    format: null,
    cleared: new Set(),
  };
  const look = line.font === null ? {} : settled(flatten(ctx, style, one));
  return { text: text(ctx, line.text, one), look };
}

/**
 * A `sparklines:` group flattened to one per cell: Excel scales each to its own
 * data unless the group says otherwise, so a group is a shared look rather than
 * a shared extent (`docs/spec.md` §19).
 */
export function sparklines(ctx: Ctx, group: SparklineGroup): CompiledSparkline[] {
  const type = spelling(ctx, group.type, SPARKLINE_TYPES, group);
  if (type === null) return [];

  const marks = group.colors;
  const shared = {
    type,
    markers: group.markers,
    high: group.high,
    low: group.low,
    axis: group.axis,
    min: group.min,
    max: group.max,
    weight: group.weight,
    color: group.color === null ? null : colour(ctx, group.color, group),
    colors:
      marks === null
        ? null
        : {
            markers: marks.markers === null ? null : colour(ctx, marks.markers, group),
            high: marks.high === null ? null : colour(ctx, marks.high, group),
            low: marks.low === null ? null : colour(ctx, marks.low, group),
          },
    node: group.id,
  };

  return group.cells.flatMap((one: Sparkline): CompiledSparkline[] => {
    const at = address(ctx, one.at, group);
    if (at === null) return [];

    const spelled = text(ctx, one.data, group);
    const read = parseQualifiedRange(spelled);
    if (read === null) {
      reject(ctx, CODE.badRange, `\`${spelled}\` is not a range`, group);
      return [];
    }

    return [{ ...shared, at, data: { sheet: read.sheet, rect: rectOf(read.at) } }];
  });
}
