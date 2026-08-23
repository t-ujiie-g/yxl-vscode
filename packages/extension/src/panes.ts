import { reading, setFilter, setFreeze } from '@yxl-vscode/intent';
import { addrAt } from '@yxl-vscode/units';
import type { Filtered, Frozen } from '@yxl-vscode/webview/protocol';
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

/**
 * A sheet's auto filter, put on the selection's header row or taken off
 * (`docs/spec.md` §10). One per sheet, so a second one replaces the first.
 */
export async function filter(spec: Spec, asked: Filtered, port: Port): Promise<void> {
  const sheet = sheetNamed(asked.sheet, port);
  if (sheet === null) return;

  const rect = asked.on
    ? { top: asked.top, left: asked.left, bottom: asked.bottom, right: asked.right }
    : null;
  const intent = setFilter(spec, { sheet, rect }, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'filter', about: null });
  if (done)
    port.said(
      asked.on ? `${sheet} has a filter on its header row.` : `${sheet} is no longer filtered.`,
    );
}
