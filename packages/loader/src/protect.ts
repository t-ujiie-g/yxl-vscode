import type { Node } from '@yxl-vscode/cst';
import type { Saying } from '@yxl-vscode/diag';
import { ALLOWANCES, type Allowance, MODELED_KEYS, type Protect } from '@yxl-vscode/spec';
import type { Ctx } from './ctx';
import { identify } from './ctx';
import { expectBool, open, optional, optionalText } from './read';
import { under } from './text';

/** A sheet's `protect:` (`docs/spec.md` §16). */
export function readProtect(ctx: Ctx, node: Node, what: Saying): Protect | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.protect);
  if (opened === null) return null;

  return {
    ...identify(opened.ctx, opened.path, opened.node.span),
    password: optionalText(opened, 'password', what),
    allow:
      optional(opened, 'allow', (entry) => readAllow(opened.ctx, entry, under(what, 'allow'))) ??
      {},
  };
}

/** An `allow:` mapping; a misspelt name is reported rather than kept as a permission that never applies. */
function readAllow(ctx: Ctx, node: Node, what: Saying): Protect['allow'] | null {
  const opened = open({ ctx, node, path: [] }, what, MODELED_KEYS.allow);
  if (opened === null) return null;

  const allow: { [K in Allowance]?: boolean } = {};
  for (const name of ALLOWANCES) {
    const said = optional(opened, name, (entry) =>
      expectBool(opened.ctx, entry, under(what, name)),
    );
    if (said !== null) allow[name] = said;
  }

  return allow;
}
