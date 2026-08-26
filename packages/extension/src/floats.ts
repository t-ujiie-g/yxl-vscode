import {
  type CompiledGrid,
  type CompiledSheet,
  type CompiledSparkline,
  cellAt,
  sheetOf,
} from '@yxl-vscode/compile';
import type { Evaluation } from '@yxl-vscode/evaluate';
import { type A1Addr, addrAt, cellOf, painted, qualified, type SheetName } from '@yxl-vscode/units';
import type {
  DrawnAt,
  DrawnChart,
  DrawnImage,
  DrawnShape,
  DrawnSparkline,
} from '@yxl-vscode/webview/protocol';
import type { PictureReader } from './pictures';

/** The size yxl's own backend gives a chart that asks for none. */
const CHART_SIZE = { width: 480, height: 260 };

/** Every cell a float hangs from, so the sheet is drawn far enough to show it. */
export function anchorsIn(sheet: CompiledSheet): A1Addr[] {
  return [
    ...sheet.charts.map((one) => one.at),
    ...sheet.images.map((one) => one.at),
    ...sheet.shapes.map((one) => one.at),
    ...sheet.sparklines.map((one) => one.at),
  ];
}

/** Each chart as the sketch the view draws: where it sits, how big, and what it names (ADR-029). */
export function chartsOf(sheet: CompiledSheet, grid: CompiledGrid | null): DrawnChart[] {
  return sheet.charts.map((one) => ({
    at: anchored(one.at, { x: 0, y: 0 }),
    size: one.size ?? CHART_SIZE,
    type: one.type,
    title: one.title,
    // Unwritten, the legend is where Excel puts one on a chart it inserts.
    legend: one.legend ?? 'bottom',
    x: one.xAxis,
    y: one.yAxis,
    series: one.series.map((each) => ({
      name: each.name ?? named(grid, sheet.name, each.nameFrom),
      values: each.values,
      categories: each.categories,
    })),
  }));
}

/** What a series' `name_from` cell holds, which is what the legend will call it. */
function named(
  grid: CompiledGrid | null,
  here: SheetName,
  from: { readonly sheet: SheetName | null; readonly at: A1Addr } | null,
): string | null {
  if (from === null || grid === null) return null;

  const sheet = sheetOf(grid, from.sheet ?? here);
  const value = sheet === null ? null : (cellAt(sheet, from.at)?.value ?? null);
  return value === null ? null : String(value);
}

/** Each image as a plate where it sits, at the extent the file's own header gives it (ADR-029). */
export function imagesOf(
  sheet: CompiledSheet,
  file: string,
  pictures: PictureReader | null,
): DrawnImage[] {
  return sheet.images.map((one) => {
    const natural = pictures === null ? null : pictures(file, one.path);
    const size =
      natural === null
        ? null
        : {
            width: Math.round(natural.width * one.scale.x),
            height: Math.round(natural.height * one.scale.y),
          };

    return {
      at: anchored(one.at, one.offset),
      size,
      file: one.path,
      alt: one.alt,
      why: size === null ? whyUnmeasured(one.path) : null,
    };
  });
}

/** Why a picture has no extent here: the file is not there to read, or its format says nothing this reads. */
function whyUnmeasured(path: string): string {
  const known = /\.(png|jpe?g|gif|bmp|svg)$/i.test(path);
  return known
    ? 'this file could not be read, so how much room it takes is unknown'
    : 'this format does not say its size in a header this preview reads';
}

/** Each shape drawn as the geometry it names, in the colours it asks for (`docs/spec.md` §18). */
export function shapesOf(sheet: CompiledSheet): DrawnShape[] {
  return sheet.shapes.map((one) => ({
    at: anchored(one.at, { x: 0, y: 0 }),
    size: one.size,
    kind: one.kind,
    text: one.text.map((line) => ({ text: line.text, style: line.look })),
    fill: one.fill === null ? null : painted(one.fill),
    line:
      one.line === null || one.line.color === null
        ? null
        : { color: painted(one.line.color), width: one.line.width ?? 1 },
    alt: one.alt,
  }));
}

function anchored(at: A1Addr, offset: { readonly x: number; readonly y: number }): DrawnAt {
  return { ...cellOf(at), x: offset.x, y: offset.y };
}

/** The sparkline a cell carries, with the points it plots read off the sheet (`docs/spec.md` §19). */
export function sparklineAt(
  sheet: CompiledSheet,
  grid: CompiledGrid | null,
  evaluation: Evaluation | null,
  at: A1Addr,
): DrawnSparkline | null {
  const one = sheet.sparklines.find((each) => each.at === at);
  if (one === undefined) return null;

  const marks = one.colors;
  return {
    type: one.type,
    points: pointsOf(sheet, grid, evaluation, one),
    markers: one.markers,
    high: one.high,
    low: one.low,
    axis: one.axis,
    min: one.min,
    max: one.max,
    weight: one.weight,
    color: one.color === null ? null : painted(one.color),
    colors:
      marks === null
        ? null
        : {
            markers: marks.markers === null ? null : painted(marks.markers),
            high: marks.high === null ? null : painted(marks.high),
            low: marks.low === null ? null : painted(marks.low),
          },
  };
}

/** What a sparkline plots: the evaluated value where there is one, else the cell's own (ADR-014). */
function pointsOf(
  here: CompiledSheet,
  grid: CompiledGrid | null,
  evaluation: Evaluation | null,
  one: CompiledSparkline,
): (number | null)[] {
  const named = one.data.sheet;
  const sheet = named === null ? here : grid === null ? null : sheetOf(grid, named);
  if (sheet === null) return [];

  const points: (number | null)[] = [];
  for (let row = one.data.rect.top; row <= one.data.rect.bottom; row += 1) {
    for (let col = one.data.rect.left; col <= one.data.rect.right; col += 1) {
      const addr = addrAt({ col, row });
      const computed = evaluation?.values.get(qualified(sheet.name, addr)) ?? null;
      const value =
        computed?.kind === 'value' ? computed.value : (cellAt(sheet, addr)?.value ?? null);
      points.push(typeof value === 'number' ? value : null);
    }
  }
  return points;
}
