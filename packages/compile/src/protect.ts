import { ALLOWANCES, type Protect } from '@yxl-vscode/spec';
import type { CompiledProtect } from './grid';

/**
 * One sheet's `protect:`, with only *whether* a password is set: a preview says
 * a sheet is locked, and never what unlocks it (`docs/spec.md` §16).
 */
export function protecting(one: Protect): CompiledProtect {
  const allow = ALLOWANCES.filter((name) => one.allow[name] === true);
  return { password: one.password !== null, allow, node: one.id };
}
