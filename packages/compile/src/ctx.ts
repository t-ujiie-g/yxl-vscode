import { type Diagnostic, error } from '@yxl-vscode/diag';
import type {
  FormulaDef,
  ScalarValue,
  SpecDoc,
  SpecNode,
  StyleDef,
  Templated,
  ValueDef,
} from '@yxl-vscode/spec';
import { CODE, type Code } from './codes';
import { asIs, type Filled, fill, resolveParams } from './params';

/**
 * What compiling a document has in hand throughout: the parameters resolved
 * once, the definitions indexed once, and somewhere to put what it could not
 * draw.
 *
 * A definition is looked up by name rather than walked for, because a spec of
 * any size references far more often than it declares.
 */
export interface Ctx {
  readonly diagnostics: Diagnostic[];
  readonly params: ReadonlyMap<string, ScalarValue>;
  readonly values: ReadonlyMap<string, ValueDef>;
  readonly formulas: ReadonlyMap<string, FormulaDef>;
  readonly styles: ReadonlyMap<string, StyleDef>;
}

export function context(doc: SpecDoc): Ctx {
  const { values, cycles } = resolveParams(doc.params);
  const ctx: Ctx = {
    diagnostics: [],
    params: values,
    values: new Map(doc.defs.values.map((def) => [def.name, def])),
    formulas: new Map(doc.defs.formulas.map((def) => [def.name, def])),
    styles: new Map(doc.defs.styles.map((def) => [def.name, def])),
  };

  for (const cycle of cycles) {
    reject(ctx, CODE.paramCycle, `a parameter's default comes back round: ${cycle}`, doc);
  }
  return ctx;
}

export function reject(ctx: Ctx, code: Code, message: string, node: SpecNode): void {
  ctx.diagnostics.push(error(code, message, { file: node.file, span: node.span }));
}

/**
 * A value with its parameters substituted, reporting the ones that could not be.
 *
 * The placeholder itself survives an unresolved name, so a grid drawn from a
 * half-written spec shows `${region}` where the value will be rather than a
 * blank that says nothing.
 */
export function filled(ctx: Ctx, value: ScalarValue, node: SpecNode): Filled {
  if (typeof value !== 'string') return asIs(value);

  const done = fill(value, (name) => ctx.params.get(name));
  report(ctx, done, node);
  return done;
}

/** The same, for a value the loader kept as a template rather than reading. */
export function filledText<T extends string>(
  ctx: Ctx,
  value: Templated<T>,
  node: SpecNode,
): Filled {
  return typeof value === 'string' ? asIs(value) : filled(ctx, value.text, node);
}

function report(ctx: Ctx, done: Filled, node: SpecNode): void {
  for (const name of done.missing) {
    reject(ctx, CODE.unknownParam, `no parameter is declared as \`${name}\``, node);
  }
  if (done.unclosed) {
    reject(ctx, CODE.unclosedPlaceholder, 'a `${` is never closed', node);
  }
}
