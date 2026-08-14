import type { Node, Path } from '@yxl-vscode/cst';
import type { Span } from '@yxl-vscode/diag';
import {
  type Defs,
  type FormulaDef,
  MODELED_KEYS,
  type Param,
  type StyleDef,
  type ValueDef,
} from '@yxl-vscode/spec';
import { formulaName, paramName, styleName, valueName } from '@yxl-vscode/units';
import { withoutLeadingEquals } from './cell';
import { CODE } from './codes';
import {
  type Ctx,
  entriesOf,
  expectMap,
  expectText,
  expectValue,
  keyOf,
  nodeAt,
  reject,
  rejectUnknownKey,
} from './read';
import { readStyle } from './style';

export const NO_DEFS: Defs = { styles: [], values: [], formulas: [] };

/**
 * The `defs:` block: three namespaces that do not see each other, so the same
 * name may be a style, a value, and a formula at once.
 *
 * A declaration's name is the key as written, placeholders and all. Unlike a
 * reference, a name is not read into anything — a `${...}` in one is text until
 * the compiler substitutes both sides of the lookup.
 */
export function readDefs(ctx: Ctx, node: Node, path: Path): Defs {
  const map = expectMap(ctx, node, '`defs`');
  if (map === null) return NO_DEFS;

  let styles: StyleDef[] = [];
  let values: ValueDef[] = [];
  let formulas: FormulaDef[] = [];

  for (const entry of entriesOf(ctx, map)) {
    const at = [...path, keyOf(entry)];
    switch (keyOf(entry)) {
      case 'styles':
        styles = readStyleDefs(ctx, entry.value, at);
        break;
      case 'values':
        values = readValueDefs(ctx, entry.value, at);
        break;
      case 'formulas':
        formulas = readFormulaDefs(ctx, entry.value, at);
        break;
      default:
        rejectUnknownKey(ctx, entry, '`defs`', MODELED_KEYS.defs);
    }
  }

  return { styles, values, formulas };
}

function readStyleDefs(ctx: Ctx, node: Node, path: Path): StyleDef[] {
  const map = expectMap(ctx, node, '`defs.styles`');
  if (map === null) return [];

  const defs: StyleDef[] = [];
  for (const entry of entriesOf(ctx, map)) {
    const key = keyOf(entry);
    const name = styleName(key);
    if (name === null) {
      rejectEmptyName(ctx, '`defs.styles`', entry.key.span);
      continue;
    }

    const style = readStyle(ctx, entry.value, `style \`${key}\``);
    if (style !== null) defs.push({ ...nodeAt(ctx, [...path, key], entry.span), name, style });
  }
  return defs;
}

function readValueDefs(ctx: Ctx, node: Node, path: Path): ValueDef[] {
  const map = expectMap(ctx, node, '`defs.values`');
  if (map === null) return [];

  const defs: ValueDef[] = [];
  for (const entry of entriesOf(ctx, map)) {
    const key = keyOf(entry);
    const name = valueName(key);
    if (name === null) {
      rejectEmptyName(ctx, '`defs.values`', entry.key.span);
      continue;
    }

    const value = expectValue(ctx, entry.value, `value \`${key}\``);
    if (value !== null) defs.push({ ...nodeAt(ctx, [...path, key], entry.span), name, value });
  }
  return defs;
}

function readFormulaDefs(ctx: Ctx, node: Node, path: Path): FormulaDef[] {
  const map = expectMap(ctx, node, '`defs.formulas`');
  if (map === null) return [];

  const defs: FormulaDef[] = [];
  for (const entry of entriesOf(ctx, map)) {
    const key = keyOf(entry);
    const name = formulaName(key);
    if (name === null) {
      rejectEmptyName(ctx, '`defs.formulas`', entry.key.span);
      continue;
    }

    const body = expectText(ctx, entry.value, `formula \`${key}\``);
    if (body !== null) {
      const site = nodeAt(ctx, [...path, key], entry.span);
      defs.push({ ...site, name, body: withoutLeadingEquals(body) });
    }
  }
  return defs;
}

/** The `params:` block, each entry holding the default it declares. */
export function readParams(ctx: Ctx, node: Node, path: Path): Param[] {
  const map = expectMap(ctx, node, '`params`');
  if (map === null) return [];

  const params: Param[] = [];
  for (const entry of entriesOf(ctx, map)) {
    const key = keyOf(entry);
    const name = paramName(key);
    if (name === null) {
      rejectEmptyName(ctx, '`params`', entry.key.span);
      continue;
    }

    const value = expectValue(ctx, entry.value, `parameter \`${key}\``);
    if (value !== null) params.push({ ...nodeAt(ctx, [...path, key], entry.span), name, value });
  }
  return params;
}

function rejectEmptyName(ctx: Ctx, what: string, at: Span): void {
  reject(ctx, CODE.badName, `a ${what} name cannot be empty`, at);
}
