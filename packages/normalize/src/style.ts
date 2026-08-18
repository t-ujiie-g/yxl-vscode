import { STYLE_PROPERTIES, type StyleProperty, type StyleValues } from '@yxl-vscode/spec';
import type { StyleName } from '@yxl-vscode/units';

/** A look the spec already declares, by the values its name resolves to. */
export interface Declared {
  readonly name: StyleName;
  readonly gives: StyleValues;
}

/** How a look is written (ADR-037): a declaration's name, a variant of one, or the look itself. */
export type Written =
  | { readonly kind: 'ref'; readonly name: StyleName }
  | { readonly kind: 'extend'; readonly base: StyleName; readonly gives: StyleValues }
  | { readonly kind: 'inline'; readonly gives: StyleValues };

/** How many properties a variant may restate before it is a look of its own (ADR-037). */
export const NEARBY = 2;

/**
 * The look a construct is to contribute, as a spec would write it (ADR-037);
 * `null` where there is nothing to write.
 */
export function normalize(wanted: StyleValues, declared: readonly Declared[]): Written | null {
  const gives = ordered(wanted);
  if (properties(gives).length === 0) return null;

  const nearest = nearestTo(gives, declared);
  if (nearest === null) return { kind: 'inline', gives };
  if (nearest.restated.length === 0) return { kind: 'ref', name: nearest.declared.name };

  return { kind: 'extend', base: nearest.declared.name, gives: only(gives, nearest.restated) };
}

/** A declaration measured against the look: what extending it would have to restate. */
interface Near {
  readonly declared: Declared;
  readonly restated: readonly StyleProperty[];
  readonly inherited: number;
}

function nearestTo(wanted: StyleValues, declared: readonly Declared[]): Near | null {
  let nearest: Near | null = null;

  for (const one of declared) {
    const near = measure(wanted, one);
    if (near !== null && (nearest === null || closer(near, nearest))) nearest = near;
  }

  return nearest;
}

/** What extending this declaration would cost, or `null` where it cannot say the look (ADR-037). */
function measure(wanted: StyleValues, declared: Declared): Near | null {
  const said = properties(declared.gives);
  if (!said.every((key) => wanted[key] !== undefined)) return null;

  const restated = properties(wanted).filter((key) => declared.gives[key] !== wanted[key]);
  const inherited =
    said.length - restated.filter((key) => declared.gives[key] !== undefined).length;
  if (restated.length > NEARBY) return null;
  if (inherited < restated.length) return null;

  return { declared, restated, inherited };
}

function closer(one: Near, than: Near): boolean {
  if (one.restated.length !== than.restated.length) {
    return one.restated.length < than.restated.length;
  }
  if (one.inherited !== than.inherited) return one.inherited > than.inherited;

  return one.declared.name < than.declared.name;
}

/** The look narrowed to the properties named, in the order it already holds them. */
function only(gives: StyleValues, keys: readonly StyleProperty[]): StyleValues {
  const kept: Record<string, unknown> = {};
  for (const key of keys) kept[key] = gives[key];
  return kept as StyleValues;
}

/** The look's properties in the order the model declares them, so one look is always the same bytes. */
function ordered(values: StyleValues): StyleValues {
  const gives: Record<string, unknown> = {};
  for (const key of STYLE_PROPERTIES) {
    if (values[key] !== undefined) gives[key] = values[key];
  }
  return gives as StyleValues;
}

function properties(values: StyleValues): StyleProperty[] {
  return STYLE_PROPERTIES.filter((key) => values[key] !== undefined);
}
