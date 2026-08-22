import { reading, setGroup } from '@yxl-vscode/intent';
import { sheetName } from '@yxl-vscode/units';
import type { Grouped } from '@yxl-vscode/webview/protocol';
import { spanSaid } from './said';
import { applied, type Port, type Spec, shown } from './write';

/**
 * Columns or rows put into an outline, or taken out of one, all the way to the
 * file: §4.4's band rows with `group:` where a size would be, so a band that
 * groups more than was named is a question rather than an answer.
 */
export async function group(
  spec: Spec,
  grouped: Grouped,
  port: Port,
  choice?: string,
): Promise<void> {
  const sheet = sheetName(grouped.sheet);
  if (sheet === null) {
    port.refuse(`\`${grouped.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const read = reading(port.text);
  const answers = setGroup({ grid: spec.grid }, { ...grouped, sheet }, read);
  const many = spanSaid(grouped.axis, grouped.first, grouped.last);

  if (answers.length === 0) {
    port.refuse(
      grouped.level === 0 ? `nothing groups ${many}` : `nothing here can group ${many}`,
      null,
    );
    return;
  }

  const sole = answers.length === 1 ? answers[0] : undefined;
  const taken = choice === undefined ? sole : answers.find((one) => one.id === choice);

  if (taken === undefined || (choice === undefined && taken.alone !== true)) {
    if (choice !== undefined) {
      port.refuse('that answer is no longer one of the ways this edit could be made', null);
      return;
    }

    port.refuse(
      `${many} take that from a band over more than them, so there is more than one way to change it`,
      {
        about: { is: 'grouped', grouped },
        canOverride: false,
        choices: answers.map(shown),
      },
    );
    return;
  }

  const done = await applied(spec, taken.intent, port, {
    anyway: false,
    from: taken.id,
    typed: null,
  });
  if (done) port.said(`${many} ${grouped.level === 0 ? 'taken out of the outline' : 'grouped'}.`);
}
