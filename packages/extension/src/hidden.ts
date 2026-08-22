import { reading, setHidden } from '@yxl-vscode/intent';
import { sheetName } from '@yxl-vscode/units';
import type { Hidden } from '@yxl-vscode/webview/protocol';
import { applied, type Port, type Spec, shown } from './write';

/**
 * Columns or rows hidden from the preview, or shown again, all the way to the
 * file: §4.4's band rows with `hidden:` where a size would be, so a band that
 * reaches past what was named is a question rather than an answer.
 */
export async function hide(spec: Spec, hidden: Hidden, port: Port, choice?: string): Promise<void> {
  const sheet = sheetName(hidden.sheet);
  if (sheet === null) {
    port.refuse(`\`${hidden.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const read = reading(port.text);
  const answers = setHidden({ grid: spec.grid }, { ...hidden, sheet }, read);

  if (answers.length === 0) {
    port.refuse(
      hidden.hidden ? `nothing here can hide ${many(hidden)}` : `nothing hides ${many(hidden)}`,
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

    port.refuse(comes(hidden), {
      about: { is: 'hidden', hidden },
      canOverride: false,
      choices: answers.map(shown),
    });
    return;
  }

  const done = await applied(spec, taken.intent, port, {
    anyway: false,
    from: taken.id,
    typed: null,
  });
  if (done) port.said(`${many(hidden)} ${hidden.hidden ? 'hidden' : 'shown again'}.`);
}

/** Why hiding is a question: what hides them says it about more than them. */
function comes(hidden: Hidden): string {
  return `${many(hidden)} take that from a band over more than them, so there is more than one way to change it`;
}

/** What was named, as the reader is told about it. */
function many(hidden: Hidden): string {
  const run = hidden.last - hidden.first + 1;
  const one = hidden.axis === 'column' ? 'column' : 'row';

  return run === 1 ? `${one} ${hidden.first}` : `${one}s ${hidden.first}-${hidden.last}`;
}
