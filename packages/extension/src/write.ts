import type { CompiledGrid, DataReader, Setting } from '@yxl-vscode/compile';
import { setFormula, setValue } from '@yxl-vscode/intent';
import type { IncludeReader } from '@yxl-vscode/loader';
import { addrAt, type FilePath, sheetName } from '@yxl-vscode/units';
import { type Change, checked } from '@yxl-vscode/verify';

/** What a reader typed into a cell, as the view sends it. */
export interface Typed {
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly text: string;
}

/**
 * What the write needs of the world outside it.
 *
 * The file as the reader has it — an open buffer differs from the disk — and a
 * way to put text back. Kept as three functions rather than reached for
 * directly, so that what happens between a gesture and a byte is testable
 * without an editor around it (ADR-004).
 */
export interface Port {
  readonly text: (file: FilePath) => string | null;
  readonly put: (file: FilePath, text: string) => void | Promise<void>;
  readonly refuse: (why: string) => void;
}

export interface Spec {
  readonly root: FilePath;
  readonly grid: CompiledGrid;
  readonly read: IncludeReader & DataReader;
  readonly params: Setting;
}

/**
 * What a reader typed into a cell, all the way to the file.
 *
 * Three things have to agree before a byte moves: the gesture has to name one
 * node of the spec (ADR-006), the checker has to find that the edit changed
 * only what it said it would (ADR-009), and the patch has to be one that can be
 * taken back (ADR-026). Each refusal is a sentence, because an edit that
 * quietly does nothing is worse than one that says why not.
 */
export async function write(spec: Spec, typed: Typed, port: Port): Promise<void> {
  const sheet = sheetName(typed.sheet);
  if (sheet === null) return;

  const at = addrAt({ col: typed.col, row: typed.row });
  const where = { sheet, at };

  // A leading `=` is a formula, as it is in Excel and in every spreadsheet a
  // reader has used; the spec's own two keys are the same distinction.
  const intent = typed.text.startsWith('=')
    ? setFormula(spec.grid, where, typed.text.slice(1), port.text)
    : setValue(spec.grid, where, meant(typed.text), port.text);

  if (intent.kind === 'refused') {
    port.refuse(intent.why);
    return;
  }

  const source = port.text(intent.file);
  if (source === null) {
    port.refuse(`${intent.file} could not be read`);
    return;
  }

  const done = checked(source, intent.patch, intent.expects, {
    root: spec.root,
    file: intent.file,
    read: spec.read,
    params: spec.params,
  });

  if (done.ok === false) {
    port.refuse(done.diagnostics[0]?.message ?? surprising(done.surprises));
    return;
  }
  if (done.ok === 'ask') {
    // The dialog that offers a choice is the next phase's; until it exists, an
    // edit that would move cells it did not name is one this editor declines to
    // make silently.
    port.refuse(surprising(done.surprises));
    return;
  }

  await port.put(intent.file, done.text);
}

/**
 * What the reader meant by what they typed.
 *
 * YAML's own reading of a bare scalar, which is what the spec would give the
 * same text: `42` is a number, `true` is a boolean, and an empty box is a cell
 * with nothing in it.
 */
function meant(typed: string): string | number | boolean | null {
  if (typed === '') return null;
  if (typed === 'true' || typed === 'false') return typed === 'true';

  const number = Number(typed);
  return typed.trim() !== '' && Number.isFinite(number) ? number : typed;
}

function surprising(surprises: readonly Change[]): string {
  const cells = surprises.filter((one) => one.kind === 'cell').length;
  return `this would also change ${cells} cell${cells === 1 ? '' : 's'} it did not name, which needs the resolution dialog`;
}
