import { reading, setFreeze } from '@yxl-vscode/intent';
import { addrAt, sheetName } from '@yxl-vscode/units';
import type { Frozen } from '@yxl-vscode/webview/protocol';
import { applied, type Port, type Spec } from './write';

/**
 * A sheet's panes frozen from the preview, all the way to the file: the sheet's
 * own `freeze:` key, which has one place to be written and so is never a
 * question (`docs/spec.md` §2).
 */
export async function freeze(spec: Spec, frozen: Frozen, port: Port): Promise<void> {
  const sheet = sheetName(frozen.sheet);
  if (sheet === null) {
    port.refuse(`\`${frozen.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const at = frozen.at === null ? null : addrAt(frozen.at);
  const intent = setFreeze({ grid: spec.grid }, { sheet, at }, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'freeze', typed: null });
  if (done)
    port.said(at === null ? `${sheet} is no longer frozen.` : `${sheet} is frozen at ${at}.`);
}
