import type { Layout, SpecNode } from '@yxl-vscode/spec';
import { type A1Addr, addrAt } from '@yxl-vscode/units';
import { CODE } from './codes';
import { type Ctx, reject } from './ctx';
import type { CompiledCell } from './grid';
import { colOf, type Placed } from './placed';
import type { DataOrigin, FacetOrigin } from './provenance';
import type { StyleLayer } from './style';
import { say } from './text';

/** A formula with each `{{name}}` as that column's cell in `row`; inside a block, a bare name is the instance's first. */
export function refs(
  ctx: Ctx,
  node: SpecNode,
  written: string,
  placed: Placed,
  scope: string | null,
  row: number,
): string | null {
  return substitute(ctx, node, written, true, (name) => {
    const own =
      scope !== null && !name.includes('.') ? colOf(placed, `${scope}.${name}`) : undefined;
    const col = own ?? colOf(placed, name);
    if (col !== undefined) return addrAt({ col, row });

    reject(ctx, CODE.unknownColumn, say('compile.no-such-column', { name }), node);
    return null;
  });
}

/** Replace each `{{name}}`; in a formula a `"…"` string literal is skipped (`docs/spec.md` §25). */
export function substitute(
  ctx: Ctx,
  node: SpecNode,
  written: string,
  inFormula: boolean,
  replace: (name: string) => string | null,
): string | null {
  let out = '';
  let quoted = false;
  let index = 0;

  while (index < written.length) {
    const char = written.charAt(index);
    if (inFormula && char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === '{' && written.charAt(index + 1) === '{') {
      const end = written.indexOf('}}', index + 2);
      if (end < 0) {
        reject(ctx, CODE.badLayout, say('compile.unclosed-column-ref'), node);
        return null;
      }

      const spelled = replace(written.slice(index + 2, end));
      if (spelled === null) return null;
      out += spelled;
      index = end + 2;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

/** A drawn cell's origin: the column, header or footer cell that wrote it, its layout, and the field it read. */
export function origin(
  node: SpecNode,
  layout: Layout,
  from: DataOrigin | null = null,
): FacetOrigin {
  return { kind: 'layout', node: node.id, layout: layout.id, from };
}

/** A cell holding nothing, wearing `style`. */
export function blankAt(at: A1Addr, style: readonly StyleLayer[], from: FacetOrigin): CompiledCell {
  return {
    at,
    value: null,
    type: null,
    formula: null,
    format: null,
    rich: null,
    style,
    provenance: { value: from, format: null },
  };
}
