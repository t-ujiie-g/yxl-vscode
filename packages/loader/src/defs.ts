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
import { type Ctx, identify, keyOf, reject } from './ctx';
import { expectText, expectValue, openEntries, rejectUnknownKey } from './read';
import { readStyle } from './style';

export const NO_DEFS: Defs = { styles: [], values: [], formulas: [] };

/** The `defs:` block, three namespaces that do not see each other; a name is the key as written. */
export function readDefs(ctx: Ctx, node: Node, path: Path): Defs {
  const opened = openEntries(ctx, node, path, '`defs`');
  if (opened === null) return NO_DEFS;
  const here = opened.ctx;

  let styles: StyleDef[] = [];
  let values: ValueDef[] = [];
  let formulas: FormulaDef[] = [];

  for (const entry of opened.entries) {
    const at = [...opened.path, keyOf(entry)];
    switch (keyOf(entry)) {
      case 'styles':
        styles = readStyleDefs(here, entry.value, at);
        break;
      case 'values':
        values = readValueDefs(here, entry.value, at);
        break;
      case 'formulas':
        formulas = readFormulaDefs(here, entry.value, at);
        break;
      default:
        rejectUnknownKey(here, entry, '`defs`', MODELED_KEYS.defs);
    }
  }

  return { styles, values, formulas };
}

function readStyleDefs(ctx: Ctx, node: Node, path: Path): StyleDef[] {
  const opened = openEntries(ctx, node, path, '`defs.styles`');
  if (opened === null) return [];
  const here = opened.ctx;

  const defs: StyleDef[] = [];
  for (const entry of opened.entries) {
    const key = keyOf(entry);
    const name = styleName(key);
    if (name === null) {
      rejectEmptyName(here, '`defs.styles`', entry.key.span);
      continue;
    }

    const style = readStyle(here, entry.value, `style \`${key}\``);
    if (style !== null)
      defs.push({ ...identify(here, [...opened.path, key], entry.span), name, style });
  }
  return defs;
}

function readValueDefs(ctx: Ctx, node: Node, path: Path): ValueDef[] {
  const opened = openEntries(ctx, node, path, '`defs.values`');
  if (opened === null) return [];
  const here = opened.ctx;

  const defs: ValueDef[] = [];
  for (const entry of opened.entries) {
    const key = keyOf(entry);
    const name = valueName(key);
    if (name === null) {
      rejectEmptyName(here, '`defs.values`', entry.key.span);
      continue;
    }

    const value = expectValue(here, entry.value, `value \`${key}\``);
    if (value !== null)
      defs.push({ ...identify(here, [...opened.path, key], entry.span), name, value });
  }
  return defs;
}

function readFormulaDefs(ctx: Ctx, node: Node, path: Path): FormulaDef[] {
  const opened = openEntries(ctx, node, path, '`defs.formulas`');
  if (opened === null) return [];
  const here = opened.ctx;

  const defs: FormulaDef[] = [];
  for (const entry of opened.entries) {
    const key = keyOf(entry);
    const name = formulaName(key);
    if (name === null) {
      rejectEmptyName(here, '`defs.formulas`', entry.key.span);
      continue;
    }

    const body = expectText(here, entry.value, `formula \`${key}\``);
    if (body !== null) {
      const site = identify(here, [...opened.path, key], entry.span);
      defs.push({ ...site, name, body: withoutLeadingEquals(body) });
    }
  }
  return defs;
}

/** The `params:` block, each entry holding the default it declares. */
export function readParams(ctx: Ctx, node: Node, path: Path): Param[] {
  const opened = openEntries(ctx, node, path, '`params`');
  if (opened === null) return [];
  const here = opened.ctx;

  const params: Param[] = [];
  for (const entry of opened.entries) {
    const key = keyOf(entry);
    const name = paramName(key);
    if (name === null) {
      rejectEmptyName(here, '`params`', entry.key.span);
      continue;
    }

    const value = expectValue(here, entry.value, `parameter \`${key}\``);
    if (value !== null)
      params.push({ ...identify(here, [...opened.path, key], entry.span), name, value });
  }
  return params;
}

function rejectEmptyName(ctx: Ctx, what: string, at: Span): void {
  reject(ctx, CODE.badName, `a ${what} name cannot be empty`, at);
}
