import { renderScalar, type Value } from '@yxl-vscode/cst';
import { STYLE_PROPERTIES, type StyleProperty, type StyleSays } from '@yxl-vscode/spec';
import type { StyleName } from '@yxl-vscode/units';

/** A look the spec already declares, by the values its name resolves to. */
export interface Declared {
  readonly name: StyleName;
  readonly gives: StyleSays;
}

/** How a look is written (ADR-037): a declaration's name, a variant of one, or the look itself. */
export type Written =
  | { readonly kind: 'ref'; readonly name: StyleName }
  | { readonly kind: 'extend'; readonly base: StyleName; readonly gives: StyleSays }
  | { readonly kind: 'inline'; readonly gives: StyleSays };

/** How many properties a variant may restate before it is a look of its own (ADR-037). */
export const NEARBY = 2;

/**
 * The look a construct is to contribute, as a spec would write it (ADR-037);
 * `null` where there is nothing to write.
 */
export function normalize(wanted: StyleSays, declared: readonly Declared[]): Written | null {
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

function nearestTo(wanted: StyleSays, declared: readonly Declared[]): Near | null {
  let nearest: Near | null = null;

  for (const one of declared) {
    const near = measure(wanted, one);
    if (near !== null && (nearest === null || closer(near, nearest))) nearest = near;
  }

  return nearest;
}

/** What extending this declaration would cost, or `null` where it cannot say the look (ADR-037). */
function measure(wanted: StyleSays, declared: Declared): Near | null {
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
function only(gives: StyleSays, keys: readonly StyleProperty[]): StyleSays {
  const kept: Record<string, unknown> = {};
  for (const key of keys) kept[key] = gives[key];
  return kept as StyleSays;
}

/** The look's properties in the order the model declares them, so one look is always the same bytes. */
function ordered(values: StyleSays): StyleSays {
  const gives: Record<string, unknown> = {};
  for (const key of STYLE_PROPERTIES) {
    if (values[key] !== undefined) gives[key] = values[key];
  }
  return gives as StyleSays;
}

function properties(values: StyleSays): StyleProperty[] {
  return STYLE_PROPERTIES.filter((key) => values[key] !== undefined);
}

/** A look as a spec writes one: the name of a declaration, or a mapping in flow form (`docs/spec.md` §6). */
export function written(of: Written): string {
  if (of.kind === 'ref') return of.name;

  const gives = spelled(of.gives);
  return of.kind === 'extend' ? `{ extends: ${of.base}, ${gives.slice(2)}` : gives;
}

/** The properties as the nested mapping they are leaves of, in flow form. */
function spelled(gives: StyleSays): string {
  const tree: Nested = {};
  for (const key of properties(gives)) {
    // An edge is the unit a spec takes a border away at, not its `style` and `colour` (`docs/spec.md` §6).
    const path = cleared(gives, key) ? key.split('.').slice(0, 2) : key.split('.');
    place(tree, path, scalar(key, gives[key]));
  }

  return flow(tree);
}

/** Whether the whole border edge this leaf belongs to is taken away. */
function cleared(gives: StyleSays, key: StyleProperty): boolean {
  if (!key.startsWith('border.')) return false;

  const edge = key.split('.').slice(0, 2).join('.');
  return properties(gives).every((one) => !one.startsWith(edge) || gives[one] === null);
}

type Nested = { [key: string]: Nested | string };

function place(tree: Nested, path: readonly string[], value: string): void {
  const [head, ...rest] = path;
  if (head === undefined) return;
  if (rest.length === 0) {
    tree[head] = value;
    return;
  }

  const under = tree[head];
  const held = typeof under === 'object' ? under : {};
  tree[head] = held;
  place(held, rest, value);
}

function flow(tree: Nested): string {
  const entries = Object.entries(tree).map(
    ([key, held]) => `${key}: ${typeof held === 'string' ? held : flow(held)}`,
  );

  return `{ ${entries.join(', ')} }`;
}

/** A colour or a format code is quoted, since `000000` and `0.0%` are not the strings they look like. */
function scalar(key: StyleProperty, value: unknown): string {
  if (value === null) return 'null';

  const spelt = key === 'format' || key === 'fill' || key.endsWith('color');
  return spelt ? renderScalar(String(value), 'double') : renderScalar(value as Value);
}
