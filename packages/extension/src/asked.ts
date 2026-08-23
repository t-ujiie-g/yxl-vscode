import type { Candidate, Reading } from '@yxl-vscode/intent';
import { reading } from '@yxl-vscode/intent';
import { type SheetName, sheetName } from '@yxl-vscode/units';
import type { About } from '@yxl-vscode/webview/protocol';
import { applied, type Port, type Spec, shown } from './write';

/**
 * What a gesture the §4.4 tables answer needs to say for itself, and nothing
 * more. `about` writes its `kind` last: a message carries its own, and the one
 * it is refused under is the one the view must send back (ADR-048).
 */
export interface Asking<T> {
  readonly about: (one: T) => About;
  readonly answers: (spec: Spec, one: T, sheet: SheetName, read: Reading) => readonly Candidate[];
  readonly nothing: (one: T) => string;
  readonly why: (one: T, answers: readonly Candidate[]) => string;
  readonly done: (one: T, taken: Candidate) => string;
}

/**
 * One such gesture, all the way to the file: one answer that is the whole
 * answer applies, several are a question, and an answer taken is applied by the
 * id it was offered under (ADR-001, ADR-048).
 */
export async function asked<T extends { readonly sheet: string }>(
  spec: Spec,
  one: T,
  port: Port,
  choice: string | undefined,
  how: Asking<T>,
): Promise<void> {
  const sheet = sheetName(one.sheet);
  if (sheet === null) {
    port.refuse(`\`${one.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const answers = how.answers(spec, one, sheet, reading(port.text));
  if (answers.length === 0) {
    port.refuse(how.nothing(one), null);
    return;
  }

  const sole = answers.length === 1 ? answers[0] : undefined;
  const taken = choice === undefined ? sole : answers.find((it) => it.id === choice);

  if (taken === undefined || (choice === undefined && taken.alone !== true)) {
    if (choice !== undefined) {
      port.refuse('that answer is no longer one of the ways this edit could be made', null);
      return;
    }

    port.refuse(how.why(one, answers), {
      about: how.about(one),
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
  if (done) port.said(how.done(one, taken));
}
