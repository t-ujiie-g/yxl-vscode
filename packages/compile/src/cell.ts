import type { CellFacets, RichRun, ScalarValue, SpecNode, Templated } from '@yxl-vscode/spec';
import { type A1Addr, parseA1Addr } from '@yxl-vscode/units';
import { CODE } from './codes';
import { type Ctx, filled, reject, text } from './ctx';
import type { CompiledCell } from './grid';
import type { FacetOrigin } from './provenance';
import { layersOf, type StyleSource } from './style';

/** An address after its parameters are substituted, or `null` with the reason reported. */
export function address(ctx: Ctx, at: Templated<A1Addr>, node: SpecNode): A1Addr | null {
  const spelled = text(ctx, at, node);
  const read = parseA1Addr(spelled);
  if (read === null) reject(ctx, CODE.badAddress, `\`${spelled}\` is not a cell reference`, node);
  return read;
}

/**
 * What a cell holds, from the six keys a `cells:` entry and an `overrides:`
 * entry both write.
 *
 * `own` is where the facets came from when the cell itself is the answer — a
 * literal for a cell, an override for an override. A `$ref` or a `${...}` moves
 * the value's origin somewhere else, and that move is the whole point of
 * recording it.
 */
export function compileFacets(
  ctx: Ctx,
  node: SpecNode & CellFacets,
  at: A1Addr,
  own: FacetOrigin,
  through: StyleSource,
): CompiledCell {
  const { value, origin } = compileValue(ctx, node, own);
  const format = node.format === null ? null : text(ctx, node.format, node);

  return {
    at,
    value,
    type: node.type,
    formula: compileFormula(ctx, node),
    format,
    rich: compileRich(ctx, node),
    style: layersOf(ctx, node, through, node.style, node.format),
    provenance: { value: origin, format: node.format === null ? null : own },
  };
}

function compileValue(
  ctx: Ctx,
  node: SpecNode & CellFacets,
  own: FacetOrigin,
): { value: ScalarValue; origin: FacetOrigin } {
  if (node.value === null) {
    const holds = node.formula !== null || node.rich !== null || node.style !== null;
    return { value: null, origin: holds ? own : { kind: 'empty' } };
  }

  if (node.value.kind === 'ref') {
    const name = text(ctx, node.value.name, node);
    const def = ctx.values.get(name);
    if (def === undefined) {
      reject(ctx, CODE.unknownValue, `no value is declared as \`${name}\``, node);
      return { value: null, origin: own };
    }
    return {
      value: filled(ctx, def.value, def).value,
      origin: { kind: 'defRef', node: node.id, def: def.id },
    };
  }

  const done = filled(ctx, node.value.value, node);
  if (done.params.length === 0) return { value: done.value, origin: own };

  return {
    value: done.value,
    origin: {
      kind: 'param',
      node: node.id,
      template: String(node.value.value),
      params: done.params,
    },
  };
}

function compileFormula(ctx: Ctx, node: SpecNode & CellFacets): string | null {
  if (node.formula === null) return null;

  if (node.formula.kind === 'ref') {
    const name = text(ctx, node.formula.name, node);
    const def = ctx.formulas.get(name);
    if (def !== undefined) return def.body;

    reject(ctx, CODE.unknownFormula, `no formula is declared as \`${name}\``, node);
    return null;
  }

  return text(ctx, node.formula.body, node);
}

function compileRich(ctx: Ctx, node: SpecNode & CellFacets): readonly RichRun[] | null {
  if (node.rich === null) return null;
  return node.rich.map((run) => ({ ...run, text: text(ctx, run.text, node) }));
}
