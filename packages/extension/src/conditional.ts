import type { CompiledRule, StyleLayer } from '@yxl-vscode/compile';
import type { Computed } from '@yxl-vscode/evaluate';
import type { Comparison, ScalarValue, TextTest } from '@yxl-vscode/spec';
import type { A1Addr } from '@yxl-vscode/units';
import { cellOf } from '@yxl-vscode/units';

/** What a cell holds for a rule to decide on: the computed value where there is one (ADR-014). */
export interface Deciding {
  readonly at: A1Addr;
  readonly value: ScalarValue;
  readonly computed: Computed | null;
}

/**
 * The looks the rules apply to a cell, in the order written, which is Excel's
 * priority order; `stop_if_true` ends the run (`docs/spec.md` §10). A rule this
 * preview cannot decide applies nothing and stops nothing.
 */
export function applied(rules: readonly CompiledRule[], cell: Deciding): StyleLayer[] {
  const layers: StyleLayer[] = [];

  for (const rule of rules) {
    if (!covers(rule, cell.at)) continue;

    const matched = matches(rule, cell);
    if (matched !== true) continue;

    layers.push(...rule.style);
    if (rule.stopIfTrue) break;
  }

  return layers;
}

/** Whether this preview can decide a rule at all, which the inspector says where it cannot. */
export function decidable(rule: CompiledRule): boolean {
  return rule.test.kind === 'cell' || rule.test.kind === 'text';
}

function covers(rule: CompiledRule, at: A1Addr): boolean {
  const { row, col } = cellOf(at);
  const rect = rule.rect;

  return row >= rect.top && row <= rect.bottom && col >= rect.left && col <= rect.right;
}

/** Whether a rule matches, or `null` where this preview does not decide that kind. */
function matches(rule: CompiledRule, cell: Deciding): boolean | null {
  const held = shown(cell);
  if (rule.test.kind === 'cell') return compares(rule.test.compares, held);
  if (rule.test.kind === 'text') return asks(rule.test.asks, held);

  return null;
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
