import type { Param, ScalarValue } from '@yxl-vscode/spec';
import type { ParamName } from '@yxl-vscode/units';

/**
 * What a `${...}` came out as (`docs/spec.md` §7).
 *
 * Best effort, like everything else that reads a spec being edited: a
 * placeholder no parameter backs is left standing in the text and named in
 * `missing`, so the grid shows what is unresolved rather than a blank.
 */
export interface Filled {
  readonly value: ScalarValue;
  readonly params: readonly ParamName[];
  readonly missing: readonly string[];
  readonly unclosed: boolean;
}

/** Where a placeholder's value comes from; `undefined` for a name nothing declares. */
export type Lookup = (name: string) => ScalarValue | undefined;

/** A value with no placeholder in it, which is the common case. */
export function asIs(value: ScalarValue): Filled {
  return { value, params: [], missing: [], unclosed: false };
}

/**
 * Substitute the parameters a string names.
 *
 * A string that is **exactly one placeholder** keeps the parameter's type, so
 * `B1: "${rate}"` is a number cell and not the text `0.085`. `$$` is a literal
 * `$`, and a `$` that begins neither escape is itself — which is what keeps
 * Excel's `$A$1` safe.
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
 * Every declared parameter, resolved.
 *
 * A default may name another parameter (`title: "${quarter} ${region}"`), so
 * resolution is depth-first with the chain carried along: a cycle stops at the
 * text as written and is named in `cycles` for the caller to report.
 */
export function resolveParams(declared: readonly Param[]): {
  readonly values: ReadonlyMap<string, ScalarValue>;
  readonly cycles: readonly string[];
} {
  const values = new Map<string, ScalarValue>();
  const cycles: string[] = [];

  function resolve(param: Param, chain: readonly string[]): ScalarValue {
    const known = values.get(param.name);
    if (known !== undefined) return known;

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
  return { values, cycles };
}
