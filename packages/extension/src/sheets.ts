import { addSheet, reading, renameSheet } from '@yxl-vscode/intent';
import { applied, type Port, type Spec, sheetNamed } from './write';

/**
 * A sheet added from the tab bar, all the way to the file: one `- name:` entry
 * at the end of `sheets:`, which is tab order (`docs/spec.md` §2).
 */
export async function add(spec: Spec, name: string, port: Port): Promise<void> {
  const intent = addSheet(spec, { name }, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'addSheet', about: null });
  if (done) port.said(`\`${name}\` added.`);
}

/**
 * A sheet renamed from its tab, all the way to the file: its `name:` and
 * everything that named it, which is one edit or none (`docs/spec.md` §2).
 */
export async function rename(spec: Spec, said: string, name: string, port: Port): Promise<void> {
  const sheet = sheetNamed(said, port);
  if (sheet === null) return;

  const intent = renameSheet(spec, { sheet, name }, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'rename', about: null });
  if (done) port.said(`\`${said}\` is \`${name}\` now.`);
}
