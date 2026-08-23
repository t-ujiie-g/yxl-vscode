import { addSheet, reading } from '@yxl-vscode/intent';
import { applied, type Port, type Spec } from './write';

/**
 * A sheet added from the tab bar, all the way to the file: one `- name:` entry
 * at the end of `sheets:`, which is tab order (`docs/spec.md` §2).
 */
export async function add(spec: Spec, name: string, port: Port): Promise<void> {
  const intent = addSheet(spec, { name }, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'addSheet', about: null });
  if (done) port.said(`\`${name}\` added.`);
}
