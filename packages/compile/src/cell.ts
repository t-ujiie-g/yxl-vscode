import type { CellFacets, ScalarValue, SpecNode, Style, Templated } from '@yxl-vscode/spec';
import { type A1Addr, parseA1Addr } from '@yxl-vscode/units';
import { CODE } from './codes';
import { type Ctx, filled, reject, text } from './ctx';
import type { CompiledCell, CompiledRun } from './grid';
import type { FacetOrigin } from './provenance';
import {
  DATE_FORMAT,
  DATETIME_FORMAT,
  DURATION_FORMAT,
  dateSerial,
  durationSerial,
} from './serial';
import { flatten, layersOf, type StyleSource } from './style';

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
  const written = node.format === null ? null : text(ctx, node.format, node);
  const typed = asTyped(ctx, node, value);

  return {
    at,
    value: typed.value,
    type: node.type,
    formula: compileFormula(ctx, node),
    format: written ?? typed.format,
    rich: compileRich(ctx, node),
    style: layersOf(ctx, node, through, node.style, node.format),
    provenance: { value: origin, format: node.format === null ? null : own },
  };
}

/**
 * A `type: date` or `type: duration` as the number Excel keeps, and the format
 * that number needs to read as what it is.
 *
 * Excel stores both as plain numbers; without the conversion the value cannot
 * wear a format at all, and without the default format the number is what the
 * grid would show. The default only stands where the spec wrote none of its
 * own (`docs/spec.md` §3).
 */
function asTyped(
  ctx: Ctx,
  node: SpecNode & CellFacets,
  value: ScalarValue,
): { value: ScalarValue; format: string | null } {
  if (typeof value !== 'string') return { value, format: null };

  if (node.type === 'date') {
    const read = dateSerial(value, ctx.from1904);
    if (read === null) {
      reject(ctx, CODE.badDate, `\`${value}\` is not a date`, node);
      return { value, format: null };
    }
    return { value: read.serial, format: read.withTime ? DATETIME_FORMAT : DATE_FORMAT };
  }

  if (node.type === 'duration') {
    const read = durationSerial(value);
    if (read === null) {
      reject(ctx, CODE.badDuration, `\`${value}\` is not an elapsed time`, node);
      return { value, format: null };
    }
    return { value: read, format: DURATION_FORMAT };
  }

  return { value, format: null };
}

function compileValue(
  ctx: Ctx,
  node: SpecNode & CellFacets,
  own: FacetOrigin,
): { value: ScalarValue; origin: FacetOrigin } {
  if (node.value === null) {
    const holds = node.formula !== null || node.rich !== null || node.style !== null;
    return { value: null, origin: holds ? own : { kind: 'empty', node: node.id } };
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
      declared: [...new Set(done.params.flatMap((name) => ctx.declared.get(name) ?? []))],
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

function compileRich(ctx: Ctx, node: SpecNode & CellFacets): readonly CompiledRun[] | null {
  if (node.rich === null) return null;

  return node.rich.map((run) => ({
    text: text(ctx, run.text, node),
    look: flatten(ctx, { ...NO_STYLE, font: run.font }, node),
  }));
}

/** A run sets a font and nothing else, so everything a style could say is absent. */
const NO_STYLE: Style = {
  extends: null,
  font: null,
  fill: null,
  border: null,
  align: null,
  protection: null,
  format: null,
};
