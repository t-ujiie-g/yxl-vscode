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
  clearRange,
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
import { type Change, checked, checkedText } from '@yxl-vscode/verify';
import type { Choice, Ranged, Typed } from '@yxl-vscode/webview/protocol';

/** What the write needs of the world outside it, injected so it is testable without an editor (ADR-004). */
export interface Port {
  readonly text: (file: FilePath) => string | null;
  readonly put: (file: FilePath, text: string) => void | Promise<void>;
  readonly refuse: (why: string, offer: Offer | null) => void;
  readonly said: (what: string) => void;
}

/** What a reader can do about a refusal: take an answer, or write the exception (ADR-007). */
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
 * What a reader typed into a cell, all the way to the file: the gesture names
 * a node (ADR-006), the checker agrees (ADR-009), and the patch can be taken
 * back (ADR-026). Every refusal is a sentence.
 */
export async function write(spec: Spec, typed: Typed, port: Port, anyway = false): Promise<void> {
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

    // An edit with one meaning applies; only one with several is a question (ADR-001).
    const sole = answers.length === 1 ? answers[0] : undefined;
    if (sole?.alone === true) {
      await applied(spec, sole.intent, port, { anyway, from: sole.id, typed });
      return;
    }

    // Rebuilt rather than spread: the incoming message carries its own `kind`.
    const offer = { sheet: typed.sheet, row: typed.row, col: typed.col, text: typed.text };
    port.refuse(intent.why, {
      typed: offer,
      canOverride: excepts(spec, where),
      choices: answers.map(shown),
    });
    return;
  }

  await applied(spec, intent, port, { anyway, from: null, typed });
}

/**
 * Every cell of a rectangle emptied, as one edit. A rectangle has no answers to
 * choose between the way a typed cell does: it is made or it is refused, and
 * the refusal says how many cells stood in the way (ADR-001).
 */
export async function empty(spec: Spec, ranged: Ranged, port: Port): Promise<void> {
  const sheet = sheetName(ranged.sheet);
  if (sheet === null) {
    port.refuse(`\`${ranged.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const { top, left, bottom, right } = ranged;
  const intent = clearRange(spec.grid, { sheet, rect: { top, left, bottom, right } }, port.text);
  const done = await applied(spec, intent, port, { anyway: false, from: null, typed: null });
  if (done && intent.kind === 'edit') {
    const cells = intent.expects.cells.size;
    port.said(`${cells} cell${cells === 1 ? '' : 's'} emptied.`);
  }
}

/**
 * One of the answers to a refused edit, taken. The candidates are worked out
 * again rather than remembered: the file may have moved since they were shown.
 */
export async function resolve(
  spec: Spec,
  typed: Typed,
  choice: string,
  port: Port,
  anyway = false,
): Promise<void> {
  const sheet = sheetName(typed.sheet);
  if (sheet === null) {
    port.refuse(`\`${typed.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  // *Apply it anyway* is the same gesture again, with the surprises accepted.
  const again = ANYWAY.exec(choice);
  if (again !== null) {
    const id = again[1] ?? '';
    return id === '' ? write(spec, typed, port, true) : resolve(spec, typed, id, port, true);
  }

  const at = addrAt({ col: typed.col, row: typed.row });
  const answers = candidates(resolving(spec, port), { sheet, at }, typed.text);
  const taken = answers.find((one) => one.id === choice);

  if (taken === undefined) {
    port.refuse('that answer is no longer one of the ways this edit could be made', null);
    return;
  }

  const done = await applied(spec, taken.intent, port, { anyway, from: taken.id, typed });
  if (done) port.said(`${taken.what.replace(/^C/, 'c')}: ${taken.moves.length} cells changed.`);
}

/** *Apply it anyway*, for the gesture itself or for one of its answers. */
const ANYWAY = /^anyway:?(.*)$/;

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

/** The same edit as an `overrides:` entry (`docs/spec.md` §23), because the reader asked for it (ADR-007). */
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
    { anyway: false, from: null, typed },
  );
  if (done) port.said(`${sheet}!${at} is now written as an override.`);
}

/** What is needed to ask this edit again where the checker finds it moves more than it named. */
interface Asked {
  readonly anyway: boolean;
  readonly from: string | null;
  readonly typed: Typed | null;
}

/** The half of a write that is the same whichever intent produced it. */
async function applied(spec: Spec, intent: Intent, port: Port, asked: Asked): Promise<boolean> {
  if (intent.kind === 'refused') {
    port.refuse(intent.why, null);
    return false;
  }

  const source = port.text(intent.file);
  if (source === null) {
    port.refuse(`${intent.file} could not be read`, null);
    return false;
  }

  const where = {
    root: spec.root,
    file: intent.file,
    read: spec.read,
    params: spec.params,
  };

  const done =
    intent.kind === 'wrote'
      ? checkedText(source, intent.text, intent.expects, where)
      : checked(source, intent.patch, intent.expects, where);

  if (done.ok === false) {
    port.refuse(done.diagnostics[0]?.message ?? surprising(done.surprises), null);
    return false;
  }
  if (done.ok === 'ask' && !asked.anyway) {
    // Asked about, not refused (ADR-009); the same gesture again confirms it.
    const typed = asked.typed;
    port.refuse(
      surprising(done.surprises),
      typed === null
        ? null
        : { typed, canOverride: false, choices: [anyhow(done.surprises, asked.from)] },
    );
    return false;
  }

  await port.put(intent.file, done.text);
  return true;
}

/** Whether an override could be written here: an address nothing writes has nothing to except (`docs/spec.md` §23). */
function excepts(spec: Spec, where: { sheet: SheetName; at: A1Addr }): boolean {
  const sheet = sheetOf(spec.grid, where.sheet);
  return sheet !== null && cellAt(sheet, where.at) !== null;
}

/** The offer that says yes to the surprises, naming the cells it would move. */
function anyhow(surprises: readonly Change[], from: string | null): Choice {
  const cells = surprises.filter((one) => one.kind === 'cell');

  return {
    id: from === null ? 'anyway' : `anyway:${from}`,
    what: 'Apply it anyway',
    moves: cells.length,
    sample: cells.slice(0, 3).map((one) => (one.kind === 'cell' ? `${one.sheet}!${one.at}` : '')),
  };
}

function surprising(surprises: readonly Change[]): string {
  const cells = surprises.filter((one) => one.kind === 'cell').length;
  return `this would also change ${cells} cell${cells === 1 ? '' : 's'} it did not name`;
}
