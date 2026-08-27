import type { CompiledProtect } from '@yxl-vscode/compile';
import type { Allowance } from '@yxl-vscode/spec';
import type { DrawnProtect } from '@yxl-vscode/webview/protocol';

/** A sheet's `protect:` as the view draws it: what it locks, and what it still allows. */
export function locked(one: CompiledProtect | null): DrawnProtect | null {
  if (one === null) return null;

  const locked = one.password ? 'protect it behind a password' : 'protect it';
  const allows =
    one.allow.length === 0
      ? "only selecting — Excel's own default"
      : one.allow.map(spelled).join(', ');

  // About the workbook, not about this editor: a spec is edited by whoever
  // wrote the lock, and nothing here is read-only because of it.
  return {
    says: `When Excel opens this sheet it will ${locked}. Excel locks every cell, so the ones marked here are the ones your readers will be able to type into — the cells a style unlocks. They will still be allowed: ${allows}. Editing the spec here is unaffected.`,
  };
}

/** One allowance in a reader's words rather than the schema's. */
function spelled(one: Allowance): string {
  return one.replace(/_/g, ' ');
}
