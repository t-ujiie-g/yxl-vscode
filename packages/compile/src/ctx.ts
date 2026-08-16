import { type Diagnostic, error } from '@yxl-vscode/diag';
import type {
  FormulaDef,
  ScalarValue,
  SpecDoc,
  SpecNode,
  StyleDef,
  Template,
  ValueDef,
} from '@yxl-vscode/spec';
import type { FilePath, NodeId } from '@yxl-vscode/units';
import { CODE, type Code } from './codes';
import { asIs, behind, type Filled, fill, resolveParams } from './params';

/**
 * A file a `data:` block names, opened. Its path resolves against the spec that
 * was opened, not the file the block is in — unlike `$include` (`docs/spec.md`
 * §9).
 */
export interface DataFile {
  readonly file: FilePath;
  readonly source: string;
}

/** How the compiler reaches a `csv:` or `json:` file without knowing what a file is (ADR-004). */
export type DataReader = (from: FilePath, path: FilePath) => DataFile | null;

/**
 * What compiling has in hand throughout: parameters resolved once, definitions
 * indexed once, the way out to a data file, and somewhere to put what it could
 * not draw.
 */
export interface Ctx {
  readonly diagnostics: Diagnostic[];
  readonly from: FilePath;
  readonly read: DataReader | null;
  readonly from1904: boolean;
  readonly params: ReadonlyMap<string, ScalarValue>;
  readonly declared: ReadonlyMap<string, readonly NodeId[]>;
  readonly values: ReadonlyMap<string, ValueDef>;
  readonly formulas: ReadonlyMap<string, FormulaDef>;
  readonly styles: ReadonlyMap<string, StyleDef>;
}

/** Where each parameter is declared, with every parameter its default is built from. */
function declarations(doc: SpecDoc): ReadonlyMap<string, readonly NodeId[]> {
  const at = new Map(doc.params.map((param) => [String(param.name), param.id]));
  const chains = behind(doc.params);

  return new Map(
    doc.params.map((param) => {
      const name = String(param.name);
      const nodes = [...(chains.get(name) ?? [])].flatMap((one) => {
        const found = at.get(one);
        return found === undefined ? [] : [found];
      });
      return [name, [param.id, ...nodes]];
    }),
  );
}

export function context(doc: SpecDoc, read: DataReader | null, set: Setting): Ctx {
  const { values, cycles, unknown } = resolveParams(doc.params, set);
  const ctx: Ctx = {
    diagnostics: [],
    from: doc.file,
    read,
    from1904: doc.date1904,
    params: values,
    declared: declarations(doc),
    values: new Map(doc.defs.values.map((def) => [def.name, def])),
    formulas: new Map(doc.defs.formulas.map((def) => [def.name, def])),
    styles: new Map(doc.defs.styles.map((def) => [def.name, def])),
  };

  for (const cycle of cycles) {
    reject(ctx, CODE.paramCycle, `a parameter's default comes back round: ${cycle}`, doc);
  }
  for (const name of unknown) {
    reject(ctx, CODE.noSuchParam, `this spec declares no parameter \`${name}\` to set`, doc);
  }
  return ctx;
}

/** What a caller wants the parameters to be, by name, as text (`docs/spec.md` §7). */
export type Setting = ReadonlyMap<string, string>;

export function reject(ctx: Ctx, code: Code, message: string, node: SpecNode): void {
  ctx.diagnostics.push(error(code, message, { file: node.file, span: node.span }));
}

/** A value with its parameters substituted; an unresolved placeholder survives as text. */
export function filled(ctx: Ctx, value: ScalarValue, node: SpecNode): Filled {
  if (typeof value !== 'string') return asIs(value);

  const done = fill(value, (name) => ctx.params.get(name));
  report(ctx, done, node);
  return done;
}

/** The same, as text — what every caller but a cell's own value wants. */
export function text(ctx: Ctx, value: ScalarValue | Template, node: SpecNode): string {
  const done =
    typeof value === 'object' && value !== null
      ? filled(ctx, value.text, node)
      : filled(ctx, value, node);
  return String(done.value);
}

function report(ctx: Ctx, done: Filled, node: SpecNode): void {
  for (const name of done.missing) {
    reject(ctx, CODE.unknownParam, `no parameter is declared as \`${name}\``, node);
  }
  if (done.unclosed) {
    reject(ctx, CODE.unclosedPlaceholder, 'a `${` is never closed', node);
  }
}
