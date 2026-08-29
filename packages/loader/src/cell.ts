import type { Entry, Node, Path } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import {
  CELL_TYPES,
  type Cell,
  type CellFacets,
  type CellValue,
  type FormulaBody,
  MODELED_KEYS,
  REF_KEY,
  type RichRun,
  type StyleProperty,
  type StyleUse,
  type Templated,
} from '@yxl-vscode/spec';
import { CODE } from './codes';
import { type Ctx, identify, keyOf, reject } from './ctx';
import { expectText, expectValue, isCleared, openEntries, openSeq, rejectUnknownKey } from './read';
import { readFont, readStyleUse } from './style';
import {
  ADDRESS,
  FORMULA_NAME,
  type Kind,
  readAs,
  readTextAs,
  spelling,
  VALUE_NAME,
} from './template';
import { about, entryOf, say, under } from './text';

/** A sheet's `cells:` mapping: one entry per addressed cell. */
export function readCells(ctx: Ctx, node: Node, path: Path): Cell[] {
  const opened = openEntries(ctx, node, path, '`cells`');
  if (opened === null) return [];

  const cells: Cell[] = [];
  for (const entry of opened.entries) {
    const cell = readCell(opened.ctx, entry, opened.path);
    if (cell !== null) cells.push(cell);
  }
  return cells;
}

function readCell(ctx: Ctx, entry: Entry, path: Path): Cell | null {
  const key = keyOf(entry);
  const at = readTextAs(ctx, key, entry.key.span, entryOf('cells'), ADDRESS);
  if (at === null) return null;

  const what = about('cell', String(key));
  const site = identify(ctx, [...path, key], entry.span);

  if (entry.value.kind !== 'map') {
    const value = expectValue(ctx, entry.value, what);
    if (value === null) return null;
    return { ...site, at, value: { kind: 'literal', value }, ...NOTHING_ELSE };
  }

  const name = refName(ctx, entry.value, what, VALUE_NAME);
  if (name !== null) {
    return { ...site, at, value: { kind: 'ref', name }, ...NOTHING_ELSE };
  }

  const expanded = readExpandedCell(ctx, entry.value, what);
  return expanded === null ? null : { ...site, at, ...expanded };
}

/** What a cell written as a bare value leaves unset. */
const NOTHING_ELSE = {
  formula: null,
  rich: null,
  type: null,
  format: null,
  clearsFormat: false,
  style: null,
} as const;

function readExpandedCell(ctx: Ctx, node: Node, what: Saying): CellFacets | null {
  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;
  const here = opened.ctx;

  const { entries } = opened;
  for (const entry of entries) {
    if (!MODELED_KEYS.cell.has(keyOf(entry))) {
      rejectUnknownKey(here, entry, what, MODELED_KEYS.cell);
    }
  }

  const body = readFacets(here, entries, what);
  return holdsSomething(here, body, opened.node, what) ? body : null;
}

/** The six keys a `cells:` entry and an override both write (`docs/spec.md` §3); other keys are the caller's. */
export function readFacets(ctx: Ctx, entries: readonly Entry[], what: Saying): CellFacets {
  let value: CellValue | null = null;
  let formula: FormulaBody | null = null;
  let rich: readonly RichRun[] | null = null;
  let type: CellFacets['type'] = null;
  let format: string | null = null;
  let clearsFormat = false;
  let style: StyleUse | null = null;

  for (const entry of entries) {
    const at = under(what, keyOf(entry));
    switch (keyOf(entry)) {
      case 'value':
        value = readCellValue(ctx, entry.value, at);
        break;
      case 'formula':
        formula = readFormulaBody(ctx, entry.value, at);
        break;
      case 'rich':
        rich = readRich(ctx, entry.value, at);
        break;
      case 'type':
        type = readAs(ctx, entry.value, at, spelling(CELL_TYPES));
        break;
      case 'format':
        if (isCleared(entry.value)) clearsFormat = true;
        else format = expectText(ctx, entry.value, at);
        break;
      case 'style':
        style = readStyleUse(ctx, entry.value, at);
        break;
      default:
        break;
    }
  }

  return { value, formula, rich, type, format, clearsFormat, style };
}

/** Whether the cell says anything at all, and whether what it says fits together (`docs/spec.md` §3). */
export function holdsSomething(ctx: Ctx, body: CellFacets, node: Node, what: Saying): boolean {
  const holdsNothing =
    body.value === null &&
    body.formula === null &&
    body.rich === null &&
    body.style === null &&
    body.format === null &&
    !body.clearsFormat;
  if (holdsNothing) {
    reject(ctx, CODE.emptyCell, say('loader.cell-needs-something', { what }), node.span);
    return false;
  }

  if (body.rich !== null && (body.value !== null || body.formula !== null)) {
    reject(ctx, CODE.conflictingKeys, say('loader.rich-and-a-value', { what }), node.span);
  }

  // `type` coerces a written value; a formula's result is Excel's to type.
  if (body.type !== null && (body.formula !== null || body.rich !== null)) {
    reject(ctx, CODE.conflictingKeys, say('loader.type-with-no-value', { what }), node.span);
  }
  if (body.type !== null && body.value?.kind === 'ref') {
    reject(
      ctx,
      CODE.conflictingKeys,
      say('loader.type-on-a-ref', { what, key: REF_KEY }),
      node.span,
    );
  }

  return true;
}

function readCellValue(ctx: Ctx, node: Node, what: Saying): CellValue | null {
  if (node.kind === 'map') {
    const name = refName(ctx, node, what, VALUE_NAME);
    if (name !== null) return { kind: 'ref', name };
  }

  const value = expectValue(ctx, node, what);
  return value === null ? null : { kind: 'literal', value };
}

function readFormulaBody(ctx: Ctx, node: Node, what: Saying): FormulaBody | null {
  if (node.kind === 'map') {
    const name = refName(ctx, node, what, FORMULA_NAME);
    if (name !== null) return { kind: 'ref', name };
  }

  const body = expectText(ctx, node, what);
  return body === null ? null : { kind: 'inline', body: withoutLeadingEquals(body) };
}

/** Excel stores a formula without its `=`; a spec may write one either way. */
export function withoutLeadingEquals(formula: string): string {
  return formula.startsWith('=') ? formula.slice(1) : formula;
}

/** The name in a `{ $ref: name }`, or `null`; a `$ref` beside any other key is not a reference. */
function refName<T>(ctx: Ctx, node: Node, what: Saying, kind: Kind<T>): Templated<T> | null {
  if (node.kind !== 'map' || node.entries.length !== 1) return null;

  const [only] = node.entries;
  if (only === undefined || keyOf(only) !== REF_KEY) return null;

  return readAs(ctx, only.value, under(what, REF_KEY), kind);
}

function readRich(ctx: Ctx, node: Node, what: Saying): readonly RichRun[] | null {
  const opened = openSeq(ctx, node, [], what);
  if (opened === null) return null;

  if (opened.node.items.length === 0) {
    reject(ctx, CODE.missingKey, say('loader.needs-a-run', { what }), node.span);
  }

  const runs: RichRun[] = [];
  for (const [index, item] of opened.node.items.entries()) {
    const run = readRichRun(opened.ctx, item, say('loader.a-run-of', { what, index: index + 1 }));
    if (run !== null) runs.push(run);
  }
  return runs;
}

function readRichRun(ctx: Ctx, node: Node, what: Saying): RichRun | null {
  if (node.kind === 'scalar') {
    const text = expectText(ctx, node, what);
    return text === null ? null : { text, font: null };
  }

  const opened = openEntries(ctx, node, [], what);
  if (opened === null) return null;
  const here = opened.ctx;

  let text: string | null = null;
  let font: RichRun['font'] = null;

  for (const entry of opened.entries) {
    const at = under(what, keyOf(entry));
    switch (keyOf(entry)) {
      case 'text':
        text = expectText(here, entry.value, at);
        break;
      case 'font': {
        // A run's font is the whole of what it wears, so there is nothing under
        // it for a `null` to take away (`docs/spec.md` §6).
        const cleared = new Set<StyleProperty>();
        font = readFont(here, entry.value, at, cleared);
        if (cleared.size > 0) {
          reject(here, CODE.notText, say('loader.cannot-unset', { what: at }), entry.value.span);
        }
        break;
      }
      default:
        rejectUnknownKey(here, entry, what, MODELED_KEYS.richRun);
    }
  }

  if (text === null) {
    reject(here, CODE.missingKey, say('loader.needs', { what, key: 'text' }), opened.node.span);
    return null;
  }
  return { text, font };
}
