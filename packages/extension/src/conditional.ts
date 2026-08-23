import type { CompiledRule, StyleLayer } from '@yxl-vscode/compile';
import type { Computed } from '@yxl-vscode/evaluate';
import type { Comparison, ScalarValue, TextTest } from '@yxl-vscode/spec';
import type { A1Addr } from '@yxl-vscode/units';
import { cellOf, type NodeId } from '@yxl-vscode/units';

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
): StyleLayer[] {
  const layers: StyleLayer[] = [];

  for (const rule of rules) {
    if (!covers(rule, cell.at)) continue;

    const matched = matches(rule, cell, ranked);
    if (matched !== true) continue;

    layers.push(...rule.style);
    if (rule.stopIfTrue) break;
  }

  return layers;
}

/** The rule kinds a cell can be decided by without looking at the rest of its range. */
const ALONE = new Set(['cell', 'text', 'formula']);

/** The kinds that need every value in the range before any one cell can be decided. */
const OVER_RANGE = new Set(['top', 'bottom', 'duplicate', 'unique']);

/** Whether this preview can decide a rule at all, which the inspector says where it cannot. */
export function decidable(rule: CompiledRule): boolean {
  return ALONE.has(rule.test.kind) || OVER_RANGE.has(rule.test.kind);
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
  const { row, col } = cellOf(at);
  const rect = rule.rect;

  return row >= rect.top && row <= rect.bottom && col >= rect.left && col <= rect.right;
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
