import {
  type CompiledGrid,
  cellAt,
  type DataReader,
  type Setting,
  sheetOf,
} from '@yxl-vscode/compile';
import {
  type Candidate,
  candidates,
  clearCell,
  type Intent,
  type Meaning,
  meaning,
  override,
  type Resolving,
  type Says,
  setFormula,
  setValue,
} from '@yxl-vscode/intent';
import type { IncludeReader } from '@yxl-vscode/loader';
import type { SpecDoc } from '@yxl-vscode/spec';
import { type A1Addr, addrAt, type FilePath, type SheetName, sheetName } from '@yxl-vscode/units';
import { type Change, checked } from '@yxl-vscode/verify';
import type { Choice, Typed } from '@yxl-vscode/webview/protocol';

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
  readonly refuse: (why: string, offer: Offer | null) => void;
  readonly said: (what: string) => void;
}

/**
 * What a reader can do about a refusal: take one of the answers the edit has,
 * or write it as the exception (ADR-007). Both are about the text they typed,
 * and `null` is a refusal there is nothing to be done about.
 */
export interface Offer {
  readonly typed: Typed;
  readonly canOverride: boolean;
  readonly choices: readonly Choice[];
}

export interface Spec {
  readonly root: FilePath;
  readonly doc: SpecDoc;
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
  if (sheet === null) {
    port.refuse(`\`${typed.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const at = addrAt({ col: typed.col, row: typed.row });
  const where = { sheet, at };

  const meant = meaning(typed.text);
  const intent =
    meant.is === 'formula'
      ? setFormula(spec.grid, where, meant.body, port.text)
      : meant.is === 'empty'
        ? clearCell(spec.grid, where, port.text)
        : setValue(spec.grid, where, meant.value, port.text);

  if (intent.kind === 'refused') {
    const answers = candidates(resolving(spec, port), where, typed.text);

    // One answer, and nothing being chosen between: an edit with one meaning
    // applies, and only an edit with several is a question (ADR-001). Asking
    // anyway would put a click in front of the most ordinary thing anyone does
    // with a spreadsheet — typing into a blank cell.
    const sole = answers.length === 1 ? answers[0] : undefined;
    if (sole?.alone === true) {
      await applied(spec, sole.intent, port);
      return;
    }

    port.refuse(intent.why, {
      // Built rather than passed through: what arrives here is the *message*
      // that asked for the edit, and a message carries its own `kind`. Handing
      // that back for the view to send again is how an override went out as an
      // edit and came back refused by the rule it was the exception to.
      typed: { sheet: typed.sheet, row: typed.row, col: typed.col, text: typed.text },
      canOverride: excepts(spec, where),
      choices: answers.map(shown),
    });
    return;
  }

  await applied(spec, intent, port);
}

/**
 * One of the answers to a refused edit, taken.
 *
 * The candidates are worked out again rather than remembered from the refusal:
 * the spec may have been edited by hand since it was shown, and an answer
 * computed against a file that has moved on is an answer to a question nobody
 * asked.
 */
export async function resolve(spec: Spec, typed: Typed, choice: string, port: Port): Promise<void> {
  const sheet = sheetName(typed.sheet);
  if (sheet === null) {
    port.refuse(`\`${typed.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const at = addrAt({ col: typed.col, row: typed.row });
  const answers = candidates(resolving(spec, port), { sheet, at }, typed.text);
  const taken = answers.find((one) => one.id === choice);

  if (taken === undefined) {
    port.refuse('that answer is no longer one of the ways this edit could be made', null);
    return;
  }

  const done = await applied(spec, taken.intent, port);
  if (done) port.said(`${taken.what.replace(/^C/, 'c')}: ${taken.moves.length} cells changed.`);
}

/** What an override says a cell holds, where the reader did not type a formula. */
function value(meant: Meaning): string | number | boolean | null {
  return meant.is === 'value' ? meant.value : null;
}

/** The spec as the resolver needs it: what it draws, its text, and its settings. */
function resolving(spec: Spec, port: Port): Resolving {
  return { grid: spec.grid, text: port.text, params: spec.params };
}

/** A candidate as the view shows one: what it does, and what it would move. */
function shown(candidate: Candidate): Choice {
  return {
    id: candidate.id,
    what: candidate.what,
    moves: candidate.moves.length,
    sample: candidate.moves.slice(0, 3).map((one) => one.at),
  };
}

/**
 * The same edit as an `overrides:` entry, which is where an edit with no other
 * home goes (`docs/spec.md` §23).
 *
 * Written only because a reader asked for it after being told why an ordinary
 * edit was refused (ADR-007), and `reason` is theirs to give — nothing in the
 * compiler reads it, and whoever opens the spec in six months does.
 */
export async function writeOverride(
  spec: Spec,
  typed: Typed,
  reason: string | undefined,
  port: Port,
): Promise<void> {
  const sheet = sheetName(typed.sheet);
  if (sheet === null) {
    port.refuse(`\`${typed.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const at = addrAt({ col: typed.col, row: typed.row });
  const meant = meaning(typed.text);
  const said = meant.is === 'formula' ? { formula: meant.body } : { value: value(meant) };
  const says: Says = { ...said, ...(reason === undefined ? {} : { reason }) };

  const done = await applied(
    spec,
    override(spec.doc, spec.grid, { sheet, at }, says, port.text),
    port,
  );
  if (done) port.said(`${sheet}!${at} is now written as an override.`);
}

/** The half of a write that is the same whichever intent produced it. */
async function applied(spec: Spec, intent: Intent, port: Port): Promise<boolean> {
  if (intent.kind === 'refused') {
    port.refuse(intent.why, null);
    return false;
  }

  const source = port.text(intent.file);
  if (source === null) {
    port.refuse(`${intent.file} could not be read`, null);
    return false;
  }

  const done = checked(source, intent.patch, intent.expects, {
    root: spec.root,
    file: intent.file,
    read: spec.read,
    params: spec.params,
  });

  if (done.ok === false) {
    port.refuse(done.diagnostics[0]?.message ?? surprising(done.surprises), null);
    return false;
  }
  if (done.ok === 'ask') {
    port.refuse(surprising(done.surprises), null);
    return false;
  }

  await port.put(intent.file, done.text);
  return true;
}

/**
 * Whether this gesture could be written as an override.
 *
 * An address nothing is written at has nothing to except, and the offer would
 * be the editor inventing a cell for a reader who mistyped (`docs/spec.md`
 * §23).
 */
function excepts(spec: Spec, where: { sheet: SheetName; at: A1Addr }): boolean {
  const sheet = sheetOf(spec.grid, where.sheet);
  return sheet !== null && cellAt(sheet, where.at) !== null;
}

function surprising(surprises: readonly Change[]): string {
  const cells = surprises.filter((one) => one.kind === 'cell').length;
  return `this would also change ${cells} cell${cells === 1 ? '' : 's'} it did not name, which needs the resolution dialog`;
}
