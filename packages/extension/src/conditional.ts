import type { CompiledRule, StyleLayer } from '@yxl-vscode/compile';
import type { Computed } from '@yxl-vscode/evaluate';
import type { Comparison, ScalarValue, TextTest } from '@yxl-vscode/spec';
import type { A1Addr } from '@yxl-vscode/units';
import { type Color, cellOf, type NodeId, painted, within } from '@yxl-vscode/units';

/** What a cell holds for a rule to decide on: the computed value where there is one (ADR-014). */
export interface Deciding {
  readonly at: A1Addr;
  readonly value: ScalarValue;
  readonly computed: Computed | null;
  /** What a `formula:` rule came to at this cell, by the rule that asked. */
  readonly conditions?: (rule: NodeId) => Computed | null;
}

/** Which addresses each rule that needs the whole range matches, worked out once for the sheet. */
export type Ranked = ReadonlyMap<NodeId, ReadonlySet<string>>;

/**
 * The looks the rules apply to a cell, in the order written, which is Excel's
 * priority order; `stop_if_true` ends the run (`docs/spec.md` §10). A rule this
 * preview cannot decide applies nothing and stops nothing.
 */
export function applied(
  rules: readonly CompiledRule[],
  cell: Deciding,
  ranked: Ranked = new Map(),
  over: Spreads = new Map(),
): StyleLayer[] {
  const layers: StyleLayer[] = [];

  for (const rule of rules) {
    if (!covers(rule, cell.at)) continue;

    const scale = scaleAt(rule, cell, over);
    if (scale !== null) {
      layers.push(scale);
      continue;
    }

    const matched = matches(rule, cell, ranked);
    if (matched !== true) continue;

    layers.push(...rule.style);
    if (rule.stopIfTrue) break;
  }

  return layers;
}

/** The kinds that need every value in the range before any one cell can be decided. */
const OVER_RANGE = new Set(['top', 'bottom', 'duplicate', 'unique']);

/** The kinds that draw an appearance of their own rather than a look over the cell. */
const OWN_LOOK = new Set(['colorScale', 'dataBar', 'iconSet']);

/** What a range's numbers come to, which is what a scale and a bar are drawn against. */
export interface Spread {
  readonly low: number;
  readonly middle: number;
  readonly high: number;
}

/** The spread of each rule that draws its own look, worked out once for the sheet. */
export type Spreads = ReadonlyMap<NodeId, Spread>;

/**
 * What the numbers of each scale's and bar's range come to: `min`, the median,
 * and `max`, which is what yxl writes as the thresholds (`percentile 50`
 * between `min` and `max`).
 */
export function spreads(
  rules: readonly CompiledRule[],
  written: readonly A1Addr[],
  held: (at: A1Addr) => ScalarValue,
): Spreads {
  const found = new Map<NodeId, Spread>();

  for (const rule of rules) {
    if (!OWN_LOOK.has(rule.test.kind)) continue;

    const numbers = written
      .filter((at) => covers(rule, at))
      .map((at) => held(at))
      .filter((value): value is number => typeof value === 'number')
      .sort((one, two) => one - two);

    const low = numbers[0];
    const high = numbers[numbers.length - 1];
    if (low === undefined || high === undefined) continue;

    found.set(rule.node, { low, middle: median(numbers), high });
  }

  return found;
}

/** The bar a `data_bar` rule draws behind a cell, or `null` where none reaches it. */
export function barAt(rules: readonly CompiledRule[], cell: Deciding, over: Spreads): Bar | null {
  for (const rule of rules) {
    if (rule.test.kind !== 'dataBar' || !covers(rule, cell.at)) continue;

    const spread = over.get(rule.node);
    const value = shown(cell);
    if (spread === undefined || typeof value !== 'number') continue;

    return {
      color: rule.test.color,
      fraction: along(value, spread.low, spread.high),
      barOnly: rule.test.barOnly,
    };
  }

  return null;
}

/** A bar drawn behind a cell's value, as far along as the value is through the range. */
export interface Bar {
  readonly color: string;
  readonly fraction: number;
  readonly barOnly: boolean;
}

/** Which icon of a set a cell gets; what one looks like is the view's to decide (ADR-029). */
export interface Icon {
  readonly set: string;
  readonly index: number;
  readonly iconsOnly: boolean;
}

/**
 * The icon an `icon_set` rule gives a cell. The thresholds are the evenly
 * spaced percents yxl writes — three icons at 0/33/67, four at 0/25/50/75 —
 * counted between the range's low and high (`docs/spec.md` §10).
 */
export function iconAt(rules: readonly CompiledRule[], cell: Deciding, over: Spreads): Icon | null {
  for (const rule of rules) {
    if (rule.test.kind !== 'iconSet' || !covers(rule, cell.at)) continue;

    const spread = over.get(rule.node);
    const value = shown(cell);
    const many = Number.parseInt(rule.test.name.slice(0, 1), 10);
    if (spread === undefined || typeof value !== 'number' || Number.isNaN(many)) continue;

    const part = along(value, spread.low, spread.high) * 100;
    const step = [...Array(many).keys()].filter((one) => part >= Math.floor((100 * one) / many));
    const index = Math.max(0, step.length - 1);

    return {
      set: rule.test.name,
      index: rule.test.reverse ? many - 1 - index : index,
      iconsOnly: rule.test.iconsOnly,
    };
  }

  return null;
}

/** The fill a `color_scale` rule gives a cell, as the layer every other look is one of. */
function scaleAt(rule: CompiledRule, cell: Deciding, over: Spreads): StyleLayer | null {
  if (rule.test.kind !== 'colorScale') return null;

  const spread = over.get(rule.node);
  const value = shown(cell);
  if (spread === undefined || typeof value !== 'number') return null;

  const test = rule.test;
  const fill =
    test.middle === null
      ? between(test.low, test.high, along(value, spread.low, spread.high))
      : value <= spread.middle
        ? between(test.low, test.middle, along(value, spread.low, spread.middle))
        : between(test.middle, test.high, along(value, spread.middle, spread.high));

  return { through: 'conditional', key: 'style', node: rule.node, name: null, gives: { fill } };
}

/** How far along a range a value sits, `0` where the range has no width at all. */
function along(value: number, low: number, high: number): number {
  if (high <= low) return value >= high ? 1 : 0;

  return Math.min(1, Math.max(0, (value - low) / (high - low)));
}

/** A colour part of the way between two, mixed as Excel mixes them: in RGB. */
function between(low: string, high: string, part: number): Color {
  const one = rgb(low);
  const two = rgb(high);
  const mixed = one.map((piece, at) => Math.round(piece + ((two[at] ?? piece) - piece) * part));

  return mixed.map((piece) => piece.toString(16).padStart(2, '0').toUpperCase()).join('') as Color;
}

function rgb(colour: string): number[] {
  const digits = painted(colour).slice(1);
  return [0, 2, 4].map((at) => Number.parseInt(digits.slice(at, at + 2), 16));
}

function median(sorted: readonly number[]): number {
  const half = Math.floor(sorted.length / 2);
  const one = sorted[half] ?? 0;
  if (sorted.length % 2 === 1) return one;

  return ((sorted[half - 1] ?? one) + one) / 2;
}

/**
 * Which cells each whole-range rule matches. `held` answers what an address
 * shows; an address it answers `null` at is blank, which Excel ranks and counts
 * as nothing.
 */
export function overRanges(
  rules: readonly CompiledRule[],
  written: readonly A1Addr[],
  held: (at: A1Addr) => ScalarValue,
): Ranked {
  const ranked = new Map<NodeId, ReadonlySet<string>>();

  for (const rule of rules) {
    if (!OVER_RANGE.has(rule.test.kind)) continue;

    const inside = written.filter((at) => covers(rule, at));
    ranked.set(rule.node, matching(rule, inside, held));
  }

  return ranked;
}

function matching(
  rule: CompiledRule,
  inside: readonly A1Addr[],
  held: (at: A1Addr) => ScalarValue,
): ReadonlySet<string> {
  const test = rule.test;
  if (test.kind === 'duplicate' || test.kind === 'unique') {
    return seenOnce(inside, held, test.kind === 'unique');
  }
  if (test.kind !== 'top' && test.kind !== 'bottom') return new Set();

  const numbers = inside
    .map((at) => held(at))
    .filter((value): value is number => typeof value === 'number');

  // Excel's own rounding for a percentage is not in the schema; this takes the
  // floor and never less than one, and a tie brings every cell that ties in.
  const many = test.percent
    ? Math.max(1, Math.floor((numbers.length * test.count) / 100))
    : test.count;
  const ordered = [...numbers].sort((one, two) => (test.kind === 'top' ? two - one : one - two));
  const edge = ordered[Math.min(many, ordered.length) - 1];
  if (edge === undefined) return new Set();

  return new Set(
    inside
      .filter((at) => {
        const value = held(at);
        return typeof value === 'number' && (test.kind === 'top' ? value >= edge : value <= edge);
      })
      .map(String),
  );
}

/** The addresses whose value appears once in the range, or more than once. */
function seenOnce(
  inside: readonly A1Addr[],
  held: (at: A1Addr) => ScalarValue,
  once: boolean,
): ReadonlySet<string> {
  const counted = new Map<string, number>();
  for (const at of inside) {
    const value = held(at);
    if (value === null) continue;

    const key = said(value);
    counted.set(key, (counted.get(key) ?? 0) + 1);
  }

  return new Set(
    inside
      .filter((at) => {
        const value = held(at);
        if (value === null) return false;

        const seen = counted.get(said(value)) ?? 0;
        return once ? seen === 1 : seen > 1;
      })
      .map(String),
  );
}

function covers(rule: CompiledRule, at: A1Addr): boolean {
  return within(cellOf(at), rule.rect);
}

/** Whether a rule matches, or `null` where this preview does not decide that kind. */
function matches(rule: CompiledRule, cell: Deciding, ranked: Ranked): boolean | null {
  const held = shown(cell);
  if (rule.test.kind === 'cell') return compares(rule.test.compares, held);
  if (rule.test.kind === 'text') return asks(rule.test.asks, held);
  if (rule.test.kind === 'formula') return truthy(cell.conditions?.(rule.node) ?? null);

  const over = ranked.get(rule.node);
  return over === undefined ? null : over.has(cell.at);
}

/** What a condition's answer means: only a value counts, and only a truthy one (`docs/spec.md` §10). */
function truthy(said: Computed | null): boolean | null {
  if (said === null) return null;
  if (said.kind !== 'value') return false;

  return said.value !== null && said.value !== false && said.value !== 0 && said.value !== '';
}

/** The value a rule decides on: what was computed, else what the spec holds. */
function shown(cell: Deciding): ScalarValue {
  return cell.computed?.kind === 'value' ? cell.computed.value : cell.value;
}

function compares(said: Comparison, held: ScalarValue): boolean {
  if (held === null) return false;

  switch (said.kind) {
    case 'between':
      return inside(said, held);
    case 'not_between':
      return !inside(said, held);
    case 'equals':
      return order(held, said.bound) === 0;
    case 'not_equals':
      return order(held, said.bound) !== 0;
    case 'at_least':
      return order(held, said.bound) >= 0;
    case 'at_most':
      return order(held, said.bound) <= 0;
    case 'greater_than':
      return order(held, said.bound) > 0;
    case 'less_than':
      return order(held, said.bound) < 0;
  }
}

function inside(said: Extract<Comparison, { kind: 'between' | 'not_between' }>, held: ScalarValue) {
  return order(held, said.low) >= 0 && order(held, said.high) <= 0;
}

/** How two values order: numbers as numbers, the rest as text, which Excel compares without case. */
function order(held: ScalarValue, bound: ScalarValue): number {
  if (typeof held === 'number' && typeof bound === 'number') return held - bound;

  const one = said(held);
  const two = said(bound);
  if (one === two) return 0;

  return one < two ? -1 : 1;
}

function said(value: ScalarValue): string {
  return value === null ? '' : String(value).toLowerCase();
}

function asks(test: TextTest, held: ScalarValue): boolean {
  const text = said(held);
  const looking = test.text.toLowerCase();

  switch (test.kind) {
    case 'contains':
      return text.includes(looking);
    case 'not_contains':
      return !text.includes(looking);
    case 'begins_with':
      return text.startsWith(looking);
    case 'ends_with':
      return text.endsWith(looking);
  }
}
