import type { A1Addr, Color, FilePath } from '@yxl-vscode/units';
import type { SpecNode, Templated } from './node';
import type { Font } from './style';

/** How big a float is drawn, in whole pixels; both ends are required where it is written (`docs/spec.md` §12). */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** What a float does when the cells beneath it change (`docs/spec.md` §13). */
export const POSITIONINGS = ['move', 'move_and_size', 'fixed'] as const;

export type Positioning = (typeof POSITIONINGS)[number];

/** The chart shapes a spec can ask for; Excel's 3-D, stock and bubble charts are not among them (`docs/spec.md` §12). */
export const CHART_TYPES = [
  'column',
  'column_stacked',
  'column_percent_stacked',
  'bar',
  'bar_stacked',
  'bar_percent_stacked',
  'line',
  'area',
  'area_stacked',
  'area_percent_stacked',
  'pie',
  'doughnut',
  'scatter',
  'radar',
] as const;

export type ChartType = (typeof CHART_TYPES)[number];

/** Where a chart puts its legend, `none` leaving it without one (`docs/spec.md` §12). */
export const LEGEND_PLACES = ['bottom', 'top', 'left', 'right', 'top_right', 'none'] as const;

export type LegendPlace = (typeof LEGEND_PLACES)[number];

/** One axis of a chart; an unset end leaves Excel scaling that end to the data (`docs/spec.md` §12). */
export interface ChartAxis {
  readonly title: Templated<string> | null;
  readonly min: number | null;
  readonly max: number | null;
}

/**
 * One series of a chart: the cells plotted, the labels down the category axis,
 * and what the legend calls it (`docs/spec.md` §12). A range is kept as
 * written, since it may name another sheet.
 */
export interface ChartSeries extends SpecNode {
  readonly values: Templated<string>;
  readonly categories: Templated<string> | null;
  readonly name: Templated<string> | null;
  readonly nameFrom: Templated<string> | null;
}

/**
 * One `charts:` entry: a picture of cells that already exist, floating above
 * the grid from the corner `at` names (`docs/spec.md` §12).
 */
export interface Chart extends SpecNode {
  readonly at: Templated<A1Addr>;
  readonly type: ChartType;
  readonly title: Templated<string> | null;
  readonly legend: LegendPlace | null;
  readonly size: Size | null;
  readonly xAxis: ChartAxis | null;
  readonly yAxis: ChartAxis | null;
  readonly series: readonly ChartSeries[];
}

/** A factor over an image's natural size; one number scales both directions (`docs/spec.md` §13). */
export interface Scale {
  readonly x: number;
  readonly y: number;
}

/** Pixels in from the anchor cell's corner, never negative (`docs/spec.md` §13). */
export interface PixelOffset {
  readonly x: number;
  readonly y: number;
}

/**
 * One `images:` entry: a picture floating above the grid, at its natural size
 * times `scale` (`docs/spec.md` §13).
 */
export interface Image extends SpecNode {
  readonly at: Templated<A1Addr>;
  readonly path: Templated<FilePath>;
  readonly alt: Templated<string> | null;
  readonly scale: Scale | null;
  readonly offset: PixelOffset | null;
  readonly positioning: Positioning | null;
}

/**
 * The preset geometries a shape takes; the ones whose DrawingML token carries a
 * capital are refused upstream and so are not here (`docs/spec.md` §18).
 */
export const SHAPE_KINDS = [
  'rectangle',
  'ellipse',
  'triangle',
  'diamond',
  'parallelogram',
  'trapezoid',
  'pentagon',
  'hexagon',
  'octagon',
  'decagon',
  'star_5',
  'plus',
  'chevron',
  'cube',
  'can',
  'donut',
  'frame',
  'heart',
  'moon',
  'sun',
  'cloud',
  'pie',
  'line',
] as const;

export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** A shape's outline: the colour, and a width in points (`docs/spec.md` §18). */
export interface ShapeLine {
  readonly color: Templated<Color>;
  readonly width: number | null;
}

/** One line of a shape's text, with the font that line alone wears (`docs/spec.md` §18). */
export interface ShapeText {
  readonly text: Templated<string>;
  readonly font: Font | null;
}

/**
 * One `shapes:` entry: a preset geometry floating above the grid, optionally
 * carrying text. Neither a `fill` nor a `line` leaves Excel drawing nothing
 * (`docs/spec.md` §18).
 */
export interface Shape extends SpecNode {
  readonly at: Templated<A1Addr>;
  readonly kind: ShapeKind;
  readonly text: readonly ShapeText[];
  readonly size: Size | null;
  readonly fill: Templated<Color> | null;
  readonly line: ShapeLine | null;
  readonly alt: Templated<string> | null;
  readonly positioning: Positioning | null;
}
