import { asTable, reading } from '@yxl-vscode/intent';
import type { Ranged } from '@yxl-vscode/webview/protocol';
import { applied, type Port, rectIn, type Spec, sheetNamed } from './write';

/**
 * A rectangle of `cells:` entries kept as an anchored `data:` block instead
 * (`docs/spec.md` §9) — the answer to a spec whose addresses have become the
 * thing that moves (§8 Q1).
 */
export async function table(spec: Spec, ranged: Ranged, port: Port): Promise<void> {
  const sheet = sheetNamed(ranged.sheet, port);
  if (sheet === null) return;

  const rect = rectIn(ranged);
  const intent = asTable(spec, { sheet, rect }, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'table', about: null });
  if (done) port.said(`${rect.bottom - rect.top + 1} rows are one table now.`);
}
