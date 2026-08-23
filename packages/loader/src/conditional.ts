import type { Node } from '@yxl-vscode/cst';
import {
  type Comparison,
  type Conditional,
  type ConditionalTest,
  MODELED_KEYS,
  type StyleUse,
  type Templated,
  type TextTest,
} from '@yxl-vscode/spec';
import type { Color } from '@yxl-vscode/units';
import { type Ctx, identify, keyOf, type Site } from './ctx';
import {
  expectBool,
  expectNumber,
  expectText,
  expectValue,
  type Opened,
  openEntries,
  readEach,
  rejectUnknownKey,
} from './read';
import { readStyleUse } from './style';
import { COLOR, RANGE, readAs } from './template';

/** A sheet's `conditional:` rules, in the order written, which is Excel's priority order. */
export function readConditional(
  ctx: Ctx,
  node: Node,
  path: readonly (string | number)[],
): Conditional[] {
  const what = 'a `conditional` entry';

  return readEach(ctx, node, path, '`conditional`', (site: Site) => {
    const rule = openEntries(site.ctx, site.node, site.path, what);
    if (rule === null) return null;

    const at = readAt(rule, what);
    const test = readTest(rule, what);
    if (at === null || test === null) return null;

    const look = readLook(rule, what);
    return {
      ...identify(rule.ctx, rule.path, rule.node.span),
      at,
      test,
      style: look.style,
      format: look.format,
      stopIfTrue: look.stopIfTrue,
    };
  });
}

function readAt(rule: Opened, what: string): Conditional['at'] | null {
  const found = rule.entries.find((entry) => keyOf(entry) === 'at');
  if (found === undefined) return null;

  return readAs(rule.ctx, found.value, `${what} \`at\``, RANGE);
}

/** The look a matching cell wears, and whether a match stops the rules after it. */
function readLook(
  rule: Opened,
  what: string,
): { style: StyleUse | null; format: string | null; stopIfTrue: boolean } {
  let style: StyleUse | null = null;
  let format: string | null = null;
  let stopIfTrue = false;

  for (const entry of rule.entries) {
    const key = keyOf(entry);
    const at = `${what} \`${key}\``;
    if (key === 'style') style = readStyleUse(rule.ctx, entry.value, at);
    if (key === 'format') format = expectText(rule.ctx, entry.value, at);
    if (key === 'stop_if_true') stopIfTrue = expectBool(rule.ctx, entry.value, at) === true;
    if (!MODELED_KEYS.conditional.has(key))
      rejectUnknownKey(rule.ctx, entry, what, MODELED_KEYS.conditional);
  }

  return { style, format, stopIfTrue };
}

/** What decides the rule: exactly one of the nine keys that can (`docs/spec.md` §10). */
function readTest(rule: Opened, what: string): ConditionalTest | null {
  for (const entry of rule.entries) {
    const key = keyOf(entry);
    const at = `${what} \`${key}\``;

    switch (key) {
      case 'cell': {
        const compares = readComparison(rule.ctx, entry.value, at);
        return compares === null ? null : { kind: 'cell', compares };
      }
      case 'text': {
        const asks = readTextTest(rule.ctx, entry.value, at);
        return asks === null ? null : { kind: 'text', asks };
      }
      case 'formula': {
        const body = expectText(rule.ctx, entry.value, at);
        return body === null ? null : { kind: 'formula', body: withoutEquals(body) };
      }
      case 'top':
      case 'bottom':
        return readRanked(rule.ctx, entry.value, at, key);
      case 'duplicate':
      case 'unique':
        return expectBool(rule.ctx, entry.value, at) === true ? { kind: key } : null;
      case 'color_scale':
        return readColorScale(rule.ctx, entry.value, at);
      case 'data_bar':
        return readDataBar(rule.ctx, entry.value, at);
      case 'icon_set':
        return readIconSet(rule.ctx, entry.value, at);
      default:
        break;
    }
  }

  return null;
}

const COMPARES = [
  'between',
  'not_between',
  'equals',
  'not_equals',
  'at_least',
  'at_most',
  'greater_than',
  'less_than',
] as const;

function readComparison(ctx: Ctx, node: Node, what: string): Comparison | null {
  const opened = openEntries(ctx, node, [], what);
  const entry = opened?.entries[0];
  if (opened === null || entry === undefined) return null;

  const key = keyOf(entry);
  const known = COMPARES.find((one) => one === key);
  if (known === undefined) return null;

  if (known === 'between' || known === 'not_between') {
    const pair = readEach(opened.ctx, entry.value, [], what, (site) =>
      expectValue(site.ctx, site.node, what),
    );
    const [low, high] = pair;
    return low === undefined || high === undefined ? null : { kind: known, low, high };
  }

  const bound = expectValue(opened.ctx, entry.value, what);
  return bound === null ? null : { kind: known, bound };
}

const ASKS = ['contains', 'not_contains', 'begins_with', 'ends_with'] as const;

function readTextTest(ctx: Ctx, node: Node, what: string): TextTest | null {
  const opened = openEntries(ctx, node, [], what);
  const entry = opened?.entries[0];
  if (opened === null || entry === undefined) return null;

  const key = keyOf(entry);
  const known = ASKS.find((one) => one === key);
  if (known === undefined) return null;

  const text = expectText(opened.ctx, entry.value, what);
  return text === null ? null : { kind: known, text };
}

function readRanked(
  ctx: Ctx,
  node: Node,
  what: string,
  kind: 'top' | 'bottom',
): ConditionalTest | null {
  if (node.kind === 'scalar') {
    const count = expectNumber(ctx, node, what);
    return count === null ? null : { kind, count, percent: false };
  }

  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;

  let count: number | null = null;
  let percent = false;
  for (const entry of opened.entries) {
    if (keyOf(entry) === 'count') count = expectNumber(opened.ctx, entry.value, what);
    if (keyOf(entry) === 'percent') percent = expectBool(opened.ctx, entry.value, what) === true;
  }

  return count === null ? null : { kind, count, percent };
}

function readColorScale(ctx: Ctx, node: Node, what: string): ConditionalTest | null {
  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;

  let low: Templated<Color> | null = null;
  let middle: Templated<Color> | null = null;
  let high: Templated<Color> | null = null;
  for (const entry of opened.entries) {
    const key = keyOf(entry);
    const read = readAs(opened.ctx, entry.value, `${what} \`${key}\``, COLOR);
    if (key === 'low') low = read;
    if (key === 'middle') middle = read;
    if (key === 'high') high = read;
  }

  return low === null || high === null ? null : { kind: 'colorScale', low, middle, high };
}

function readDataBar(ctx: Ctx, node: Node, what: string): ConditionalTest | null {
  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;

  let color: Templated<Color> | null = null;
  let barOnly = false;
  for (const entry of opened.entries) {
    const key = keyOf(entry);
    if (key === 'color') color = readAs(opened.ctx, entry.value, `${what} \`color\``, COLOR);
    if (key === 'bar_only') barOnly = expectBool(opened.ctx, entry.value, what) === true;
  }

  return color === null ? null : { kind: 'dataBar', color, barOnly };
}

function readIconSet(ctx: Ctx, node: Node, what: string): ConditionalTest | null {
  if (node.kind === 'scalar') {
    const name = expectText(ctx, node, what);
    return name === null ? null : { kind: 'iconSet', name, reverse: false, iconsOnly: false };
  }

  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;

  let name: string | null = null;
  let reverse = false;
  let iconsOnly = false;
  for (const entry of opened.entries) {
    const key = keyOf(entry);
    if (key === 'style') name = expectText(opened.ctx, entry.value, what);
    if (key === 'reverse') reverse = expectBool(opened.ctx, entry.value, what) === true;
    if (key === 'icons_only') iconsOnly = expectBool(opened.ctx, entry.value, what) === true;
  }

  return name === null ? null : { kind: 'iconSet', name, reverse, iconsOnly };
}

function withoutEquals(formula: string): string {
  return formula.startsWith('=') ? formula.slice(1) : formula;
}
