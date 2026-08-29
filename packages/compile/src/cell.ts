import {
  CELL_TYPES,
  type CellFacets,
  type CellType,
  type ScalarValue,
  type SpecNode,
  type Style,
  type Templated,
} from '@yxl-vscode/spec';
import { type A1Addr, type Color, parseA1Addr, parseColor } from '@yxl-vscode/units';
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
import { flatten, layersOf, type StyleSource, settled } from './style';
import { say } from './text';

/** An address after its parameters are substituted, or `null` with the reason reported. */
export function address(ctx: Ctx, at: Templated<A1Addr>, node: SpecNode): A1Addr | null {
  const spelled = text(ctx, at, node);
  const read = parseA1Addr(spelled);
  if (read === null)
    reject(ctx, CODE.badAddress, say('compile.not-a-cell-reference', { spelled }), node);
  return read;
}

/** A spelling after its parameters are substituted, or `null` with the reason reported. */
export function spelling<T extends string>(
  ctx: Ctx,
  said: Templated<T>,
  vocabulary: readonly T[],
  node: SpecNode,
): T | null {
  const spelled = text(ctx, said, node);
  const found = vocabulary.find((known) => known === spelled);
  if (found === undefined) {
    reject(
      ctx,
      CODE.badSpelling,
      say('compile.not-one-of', { spelled, choices: vocabulary.join(', ') }),
      node,
    );
  }
  return found ?? null;
}

/** A colour after its parameters are substituted, or `null` with the reason reported. */
export function colour(ctx: Ctx, said: Templated<Color>, node: SpecNode): Color | null {
  const spelled = text(ctx, said, node);
  const read = parseColor(spelled);
  if (read === null)
    reject(ctx, CODE.badColour, say('compile.not-a-hex-colour', { spelled }), node);
  return read;
}

/**
 * What a cell holds, from the six keys a cell and an override both write. `own`
 * is the origin when the cell itself is the answer; a `$ref` or a `${...}`
 * moves it.
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
  const type = node.type === null ? null : spelling(ctx, node.type, CELL_TYPES, node);
  const typed = asTyped(ctx, node, type, value);

  return {
    at,
    value: typed.value,
    type,
    formula: compileFormula(ctx, node),
    format: written ?? typed.format,
    rich: compileRich(ctx, node),
    style: layersOf(ctx, node, through, node.style, node.format, node.clearsFormat),
    provenance: { value: origin, format: node.format === null ? null : own },
  };
}

/** A `type: date` or `type: duration` as the number Excel keeps, under the format it reads (`docs/spec.md` §3). */
function asTyped(
  ctx: Ctx,
  node: SpecNode & CellFacets,
  type: CellType | null,
  value: ScalarValue,
): { value: ScalarValue; format: string | null } {
  if (typeof value !== 'string') return { value, format: null };

  if (type === 'date') {
    const read = dateSerial(value, ctx.from1904);
    if (read === null) {
      reject(ctx, CODE.badDate, say('compile.not-a-date', { value: String(value) }), node);
      return { value, format: null };
    }
    return { value: read.serial, format: read.withTime ? DATETIME_FORMAT : DATE_FORMAT };
  }

  if (type === 'duration') {
    const read = durationSerial(value);
    if (read === null) {
      reject(
        ctx,
        CODE.badDuration,
        say('compile.not-an-elapsed-time', { value: String(value) }),
        node,
      );
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
      reject(ctx, CODE.unknownValue, say('compile.no-such-value', { name }), node);
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

    reject(ctx, CODE.unknownFormula, say('compile.no-such-formula', { name }), node);
    return null;
  }

  return text(ctx, node.formula.body, node);
}

function compileRich(ctx: Ctx, node: SpecNode & CellFacets): readonly CompiledRun[] | null {
  if (node.rich === null) return null;

  return node.rich.map((run) => ({
    text: text(ctx, run.text, node),
    look: settled(flatten(ctx, { ...NO_STYLE, font: run.font }, node)),
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
  cleared: new Set(),
};

/** Which of a cell's three facets a construct spoke of (`docs/spec.md` §2, §23). */
export interface Spoke {
  readonly holds: boolean;
  readonly format: boolean;
  readonly style: boolean;
}

/** What an entry said of a cell: what it holds, its format, its look — each separately. */
export function spokenBy(node: CellFacets): Spoke {
  return {
    holds: node.value !== null || node.formula !== null || node.rich !== null,
    format: node.format !== null || node.clearsFormat,
    style: node.style !== null,
  };
}

/** A construct laid over what an earlier one said: each facet is the last that spoke of it. */
export function layer(under: CompiledCell, over: CompiledCell, said: Spoke): CompiledCell {
  return {
    at: under.at,
    value: said.holds ? over.value : under.value,
    type: said.holds ? over.type : under.type,
    formula: said.holds ? over.formula : under.formula,
    rich: said.holds ? over.rich : under.rich,
    format: said.format ? over.format : under.format,
    style: [...under.style, ...over.style],
    provenance: {
      value: said.holds ? over.provenance.value : under.provenance.value,
      format: said.format ? over.provenance.format : under.provenance.format,
    },
  };
}
