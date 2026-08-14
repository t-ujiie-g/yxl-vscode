import type { Entry, Node, Path } from '@yxl-vscode/cst';
import {
  CELL_TYPES,
  type Cell,
  type CellType,
  type CellValue,
  type FormulaBody,
  MODELED_KEYS,
  REF_KEY,
  type RichRun,
  type SpecNode,
  type StyleUse,
  type Templated,
} from '@yxl-vscode/spec';
import { CODE } from './codes';
import {
  type Ctx,
  entriesOf,
  expectMap,
  expectSeq,
  expectSpelling,
  expectText,
  expectValue,
  keyOf,
  nodeAt,
  reject,
  rejectUnknownKey,
} from './read';
import { readFont, readStyleUse } from './style';
import { ADDRESS, FORMULA_NAME, type Kind, readAs, readTextAs, VALUE_NAME } from './template';

/** A sheet's `cells:` mapping: one entry per addressed cell. */
export function readCells(ctx: Ctx, node: Node, path: Path): Cell[] {
  const map = expectMap(ctx, node, '`cells`');
  if (map === null) return [];

  const cells: Cell[] = [];
  for (const entry of entriesOf(ctx, map)) {
    const cell = readCell(ctx, entry, path);
    if (cell !== null) cells.push(cell);
  }
  return cells;
}

function readCell(ctx: Ctx, entry: Entry, path: Path): Cell | null {
  const key = keyOf(entry);
  const at = readTextAs(ctx, key, entry.key.span, 'a `cells` key', ADDRESS);
  if (at === null) return null;

  const what = `cell \`${key}\``;
  const site = nodeAt(ctx, [...path, key], entry.span);

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
  style: null,
} as const;

type CellBody = Omit<Cell, keyof SpecNode | 'at'>;

function readExpandedCell(ctx: Ctx, node: Node, what: string): CellBody | null {
  const map = expectMap(ctx, node, what);
  if (map === null) return null;

  let value: CellValue | null = null;
  let formula: FormulaBody | null = null;
  let rich: readonly RichRun[] | null = null;
  let type: CellType | null = null;
  let format: string | null = null;
  let style: StyleUse | null = null;

  for (const entry of entriesOf(ctx, map)) {
    const at = `${what} \`${keyOf(entry)}\``;
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
        type = expectSpelling(ctx, entry.value, at, CELL_TYPES);
        break;
      case 'format':
        format = expectText(ctx, entry.value, at);
        break;
      case 'style':
        style = readStyleUse(ctx, entry.value, at);
        break;
      default:
        rejectUnknownKey(ctx, entry, what, MODELED_KEYS.cell);
    }
  }

  const body = { value, formula, rich, type, format, style };
  return holdsSomething(ctx, body, node, what) ? body : null;
}

/**
 * Whether the cell says anything at all, and whether what it says fits together.
 *
 * A cell with only a look is a spec construct, not a mistake — a shaded box, the
 * ruled edge of a table, the blank half of a merged heading. A cell with nothing
 * is unfinished, and there is nothing to project.
 */
function holdsSomething(ctx: Ctx, body: CellBody, node: Node, what: string): boolean {
  const holdsNothing =
    body.value === null &&
    body.formula === null &&
    body.rich === null &&
    body.style === null &&
    body.format === null;
  if (holdsNothing) {
    reject(
      ctx,
      CODE.emptyCell,
      `${what} needs a \`value\`, a \`formula\`, or a \`style\``,
      node.span,
    );
    return false;
  }

  if (body.rich !== null && (body.value !== null || body.formula !== null)) {
    reject(ctx, CODE.conflictingKeys, `${what} cannot be \`rich\` and hold a value too`, node.span);
  }

  // `type` coerces a written value, so it needs one: a formula's result is
  // Excel's to type, a `$ref` takes the definition's, and `rich` is text.
  if (body.type !== null && (body.formula !== null || body.rich !== null)) {
    reject(
      ctx,
      CODE.conflictingKeys,
      `${what} has a \`type\` with no value to apply it to`,
      node.span,
    );
  }
  if (body.type !== null && body.value?.kind === 'ref') {
    reject(
      ctx,
      CODE.conflictingKeys,
      `${what} cannot give a \`type\` to a \`${REF_KEY}\``,
      node.span,
    );
  }

  return true;
}

function readCellValue(ctx: Ctx, node: Node, what: string): CellValue | null {
  if (node.kind === 'map') {
    const name = refName(ctx, node, what, VALUE_NAME);
    if (name !== null) return { kind: 'ref', name };
  }

  const value = expectValue(ctx, node, what);
  return value === null ? null : { kind: 'literal', value };
}

function readFormulaBody(ctx: Ctx, node: Node, what: string): FormulaBody | null {
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

/**
 * The name in a `{ $ref: name }`, or `null` if this mapping is not one.
 *
 * A `$ref` beside any other key is not a reference — yxl reads it as an
 * ordinary mapping and then finds a key it does not know, and so do we.
 */
function refName<T>(ctx: Ctx, node: Node, what: string, kind: Kind<T>): Templated<T> | null {
  if (node.kind !== 'map' || node.entries.length !== 1) return null;

  const [only] = node.entries;
  if (only === undefined || keyOf(only) !== REF_KEY) return null;

  return readAs(ctx, only.value, `${what} \`${REF_KEY}\``, kind);
}

function readRich(ctx: Ctx, node: Node, what: string): readonly RichRun[] | null {
  const seq = expectSeq(ctx, node, what);
  if (seq === null) return null;

  const runs: RichRun[] = [];
  for (const [index, item] of seq.items.entries()) {
    const run = readRichRun(ctx, item, `${what} run ${index + 1}`);
    if (run !== null) runs.push(run);
  }
  return runs;
}

function readRichRun(ctx: Ctx, node: Node, what: string): RichRun | null {
  if (node.kind === 'scalar') {
    const text = expectText(ctx, node, what);
    return text === null ? null : { text, font: null };
  }

  const map = expectMap(ctx, node, what);
  if (map === null) return null;

  let text: string | null = null;
  let font: RichRun['font'] = null;

  for (const entry of entriesOf(ctx, map)) {
    const at = `${what} \`${keyOf(entry)}\``;
    switch (keyOf(entry)) {
      case 'text':
        text = expectText(ctx, entry.value, at);
        break;
      case 'font':
        font = readFont(ctx, entry.value, at);
        break;
      default:
        rejectUnknownKey(ctx, entry, what, MODELED_KEYS.richRun);
    }
  }

  if (text === null) {
    reject(ctx, CODE.missingKey, `${what} needs a \`text\``, node.span);
    return null;
  }
  return { text, font };
}
