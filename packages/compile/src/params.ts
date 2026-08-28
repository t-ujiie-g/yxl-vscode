import type { Param, ScalarValue } from '@yxl-vscode/spec';
import type { ParamName } from '@yxl-vscode/units';
import { infer } from './table';

/** What a `${...}` came out as (`docs/spec.md` §7); an unbacked placeholder stays in the text and is named in `missing`. */
export interface Filled {
  readonly value: ScalarValue;
  readonly params: readonly ParamName[];
  readonly missing: readonly string[];
  readonly unclosed: boolean;
}

/** Where a placeholder's value comes from; `undefined` for a name nothing declares. */
type Lookup = (name: string) => ScalarValue | undefined;

/** A value with no placeholder in it, which is the common case. */
export function asIs(value: ScalarValue): Filled {
  return { value, params: [], missing: [], unclosed: false };
}

/** Whether a string names a parameter at all, which is what an edit must not write over (`docs/spec.md` §7). */
export function namesParam(text: string): boolean {
  return fill(text, () => undefined).missing.length > 0;
}

/**
 * Substitute the parameters a string names (`docs/spec.md` §7): exactly one
 * placeholder keeps the parameter's type, `$$` is a literal `$`, and a lone `$`
 * is itself.
 */
export function fill(text: string, lookup: Lookup): Filled {
  const params: ParamName[] = [];
  const missing: string[] = [];
  let built = '';
  let only: ScalarValue | undefined;
  let unclosed = false;
  let index = 0;

  while (index < text.length) {
    const here = text.charAt(index);
    const next = text.charAt(index + 1);

    if (here !== '$' || (next !== '$' && next !== '{')) {
      built += here;
      only = undefined;
      index += 1;
      continue;
    }
    if (next === '$') {
      built += '$';
      only = undefined;
      index += 2;
      continue;
    }

    const close = text.indexOf('}', index + 2);
    if (close < 0) {
      unclosed = true;
      built += text.slice(index);
      only = undefined;
      break;
    }

    const name = text.slice(index + 2, close);
    const value = lookup(name);
    if (value === undefined) {
      missing.push(name);
      built += text.slice(index, close + 1);
      only = undefined;
    } else {
      params.push(name as ParamName);
      only = built === '' && close + 1 === text.length ? value : undefined;
      built += String(value ?? '');
    }
    index = close + 1;
  }

  return { value: only === undefined ? built : only, params, missing, unclosed };
}

/**
 * Every declared parameter, resolved. A default may name another, so a cycle
 * is named in `cycles`; a `set` name the spec does not declare comes back in
 * `unknown`.
 */
export function resolveParams(
  declared: readonly Param[],
  set: ReadonlyMap<string, string> = new Map(),
): {
  readonly values: ReadonlyMap<string, ScalarValue>;
  readonly cycles: readonly string[];
  readonly unknown: readonly string[];
} {
  const values = new Map<string, ScalarValue>();
  const cycles: string[] = [];

  function resolve(param: Param, chain: readonly string[]): ScalarValue {
    const known = values.get(param.name);
    if (known !== undefined) return known;

    const given = set.get(param.name);
    if (given !== undefined) {
      // A given value is not a template to fill in.
      const read = infer(given);
      values.set(param.name, read);
      return read;
    }

    if (chain.includes(param.name)) {
      cycles.push([...chain, param.name].join(' → '));
      return param.value;
    }

    const value =
      typeof param.value === 'string'
        ? fill(param.value, (name) => within(name, [...chain, param.name])).value
        : param.value;
    values.set(param.name, value);
    return value;
  }

  function within(name: string, chain: readonly string[]): ScalarValue | undefined {
    const other = declared.find((one) => one.name === name);
    return other === undefined ? undefined : resolve(other, chain);
  }

  for (const param of declared) resolve(param, []);

  const unknown = [...set.keys()].filter((name) => !declared.some((one) => one.name === name));
  return { values, cycles, unknown };
}

/** Every parameter each default depends on, transitively (`docs/spec.md` §7); a cycle stops. */
export function behind(declared: readonly Param[]): ReadonlyMap<string, ReadonlySet<string>> {
  const named = new Map(declared.map((one) => [String(one.name), one]));
  const found = new Map<string, ReadonlySet<string>>();

  const walk = (name: string, chain: readonly string[]): ReadonlySet<string> => {
    const known = found.get(name);
    if (known !== undefined) return known;
    if (chain.includes(name)) return new Set();

    const param = named.get(name);
    const reads =
      param === undefined || typeof param.value !== 'string'
        ? []
        : fill(param.value, () => undefined).missing.filter((one) => named.has(one));

    const all = new Set<string>(reads);
    for (const one of reads) for (const deeper of walk(one, [...chain, name])) all.add(deeper);

    found.set(name, all);
    return all;
  };

  for (const param of declared) walk(String(param.name), []);
  return found;
}
