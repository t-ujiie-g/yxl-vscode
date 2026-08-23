import { reading, setFreeze } from '@yxl-vscode/intent';
import { addrAt } from '@yxl-vscode/units';
import type { Frozen } from '@yxl-vscode/webview/protocol';
import { applied, type Port, type Spec, sheetNamed } from './write';

/**
 * A sheet's panes frozen from the preview, all the way to the file: the sheet's
 * own `freeze:` key, which has one place to be written and so is never a
 * question (`docs/spec.md` §2).
 */
export async function freeze(spec: Spec, frozen: Frozen, port: Port): Promise<void> {
  const sheet = sheetNamed(frozen.sheet, port);
  if (sheet === null) return;

  const at = frozen.at === null ? null : addrAt(frozen.at);
  const intent = setFreeze(spec, { sheet, at }, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'freeze', about: null });
  if (done)
    port.said(at === null ? `${sheet} is no longer frozen.` : `${sheet} is frozen at ${at}.`);
}
