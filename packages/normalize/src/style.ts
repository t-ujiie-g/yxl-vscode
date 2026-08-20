import { renderScalar, type Value } from '@yxl-vscode/cst';
import {
  BORDER_EDGES,
  ordered,
  propertiesOf,
  type StyleProperty,
  type StyleSays,
} from '@yxl-vscode/spec';
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
  if (propertiesOf(gives).length === 0) return null;

  const nearest = nearestTo(gives, declared);
  if (nearest === null) return { kind: 'inline', gives };
  if (nearest.restated.length === 0) return { kind: 'ref', name: nearest.declared.name };

  return { kind: 'extend', base: nearest.declared.name, gives: ordered(gives, nearest.restated) };
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
  const said = propertiesOf(declared.gives);
  if (!said.every((key) => wanted[key] !== undefined)) return null;

  const restated = propertiesOf(wanted).filter((key) => declared.gives[key] !== wanted[key]);
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

/** A look as a spec writes one: the name of a declaration, or a mapping in flow form (`docs/spec.md` §6). */
export function written(of: Written): string {
  if (of.kind === 'ref') return of.name;

  const gives = spelled(of.gives);
  return of.kind === 'extend' ? `{ extends: ${of.base}, ${gives.slice(2)}` : gives;
}

/** The properties as the nested mapping they are leaves of, in flow form. */
function spelled(gives: StyleSays): string {
  const tree: Nested = {};
  let drawn = false;

  for (const key of propertiesOf(gives)) {
    if (key.startsWith('border.')) {
      if (!drawn) place(tree, ['border'], borders(gives));
      drawn = true;
      continue;
    }
    place(tree, key.split('.'), scalar(key, gives[key]));
  }

  return flow(tree);
}

/** A border as a spec writes one: four edges alike are one word (`docs/spec.md` §6). */
function borders(gives: StyleSays): Nested | string {
  const said: Nested = {};
  for (const edge of BORDER_EDGES) {
    const one = edgeOf(gives, edge);
    if (one !== null) said[edge] = one;
  }

  const all = Object.values(said);
  const first = all[0];
  const alike = all.length === BORDER_EDGES.length && all.every((one) => one === first);
  return alike && typeof first === 'string' ? first : said;
}

/** One edge: its line style where that is all the look says of it, `null` where the look takes the edge away. */
function edgeOf(gives: StyleSays, edge: string): Nested | string | null {
  const keys = [`border.${edge}.style`, `border.${edge}.color`] as StyleProperty[];
  const said = keys.filter((one) => gives[one] !== undefined);
  const [line, colour] = keys;
  if (said.length === 0 || line === undefined || colour === undefined) return null;
  if (said.every((one) => gives[one] === null)) return 'null';
  if (gives[colour] === undefined) return scalar(line, gives[line]);

  const held: Nested = {};
  for (const one of said) held[one.split('.')[2] ?? one] = scalar(one, gives[one]);
  return held;
}

type Nested = { [key: string]: Nested | string };

function place(tree: Nested, path: readonly string[], value: Nested | string): void {
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
