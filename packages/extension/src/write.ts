import type { CompiledGrid, DataReader, Setting } from '@yxl-vscode/compile';
import {
  type Candidate,
  candidates,
  clearCell,
  clearRange,
  excepting,
  type Intent,
  type Meaning,
  meaning,
  overridable,
  override,
  type Reading,
  type Resolving,
  reading,
  type Says,
  type Stood,
  setFormula,
  setValue,
} from '@yxl-vscode/intent';
import type { IncludeReader } from '@yxl-vscode/loader';
import type { Step } from '@yxl-vscode/patch';
import type { SpecDoc } from '@yxl-vscode/spec';
import { addrAt, type FilePath, qualified, type SheetName, sheetName } from '@yxl-vscode/units';
import { type Change, checked, checkedText } from '@yxl-vscode/verify';
import type { About, Choice, Ranged, Typed } from '@yxl-vscode/webview/protocol';

/**
 * What the write needs of the world outside it, injected so it is testable
 * without an editor (ADR-004). `kept` is told of every edit — `null` for one
 * this editor cannot take back — and `left` says what it left a file at (ADR-030).
 */
export interface Port {
  readonly text: (file: FilePath) => string | null;
  readonly put: (file: FilePath, text: string) => void | Promise<void>;
  readonly refuse: (why: string, offer: Offer | null) => void;
  readonly said: (what: string) => void;
  readonly kept: (step: Step | null) => void;
  readonly left: (file: FilePath) => string | null;
}

/**
 * What a reader can do about a refusal: take an answer, or write the exception
 * (ADR-007). The subject is what the gesture named — a cell or a rectangle.
 */
export interface Offer {
  readonly about: About | null;
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
  const sheet = sheetNamed(typed.sheet, port);
  if (sheet === null) return;

  const at = addrAt({ col: typed.col, row: typed.row });
  const where = { sheet, at };

  const read = reading(port.text);
  const meant = meaning(typed.text);
  const intent =
    meant.is === 'formula'
      ? setFormula(spec.grid, where, meant.body, read)
      : meant.is === 'empty'
        ? clearCell(spec.grid, where, read)
        : setValue(spec.grid, where, meant.value, read);

  if (intent.kind === 'refused') {
    const answers = candidates(resolving(spec, read), where, typed.text);

    // An edit with one meaning applies; only one with several is a question (ADR-001).
    const sole = answers.length === 1 ? answers[0] : undefined;
    if (sole?.alone === true) {
      await applied(spec, sole.intent, port, { anyway, from: sole.id, about: about(typed) });
      return;
    }

    port.refuse(intent.why, {
      about: about(typed),
      canOverride: overridable(spec.grid, where),
      choices: answers.map(shown),
    });
    return;
  }

  await applied(spec, intent, port, { anyway, from: null, about: about(typed) });
}

/**
 * Every cell of a rectangle emptied, as one edit. One that cannot be emptied
 * refuses the whole and is offered as an answer instead: the same rectangle
 * with `only` those that can (ADR-001).
 */
export async function empty(spec: Spec, ranged: Ranged, port: Port, only = false): Promise<void> {
  const sheet = sheetNamed(ranged.sheet, port);
  if (sheet === null) return;

  const read = reading(port.text);
  const { top, left, bottom, right } = ranged;
  const where = { sheet, rect: { top, left, bottom, right } };
  const intent = clearRange(spec.grid, where, read, only);

  if (intent.kind === 'refused' && !only) {
    const some = clearRange(spec.grid, where, read, true);
    const cells = some.kind === 'edit' ? some.expects.cells : null;

    port.refuse(intent.why, theseOnly({ ...ranged, kind: 'empty' }, EMPTIED, cells));
    return;
  }

  const done = await applied(spec, intent, port, ASKED);
  if (done && intent.kind === 'edit') {
    const cells = intent.expects.cells.size;
    port.said(`${cells} cell${cells === 1 ? '' : 's'} emptied.`);
  }
}

/**
 * The answers a rectangle that cannot be done whole has: leave the ones that
 * stood in the way, and one per group of them (§8 Q14); `null` where it has none.
 */
export function theseOnly(
  about: About,
  what: string,
  cells: ReadonlySet<string> | null,
  apart: readonly Choice[] = [],
): Offer | null {
  const named = cells === null ? [] : [...cells];
  const choices =
    named.length === 0
      ? [...apart]
      : [{ id: ONLY, what, moves: named.length, sample: named.slice(0, 3) }, ...apart];

  return choices.length === 0 ? null : { about, canOverride: false, choices };
}

/** Every group of blocked cells that has an answer of its own, as the answers to offer beside the first. */
export function perOrigin(
  skipped: ReadonlySet<string>,
  trying: (by: Stood) => Intent,
  doing: string,
): Choice[] {
  const apart: Choice[] = [];

  for (const by of EXCEPTED) {
    const one = trying(by);
    if (one.kind !== 'edit') continue;

    const many = one.expects.cells.size - skipped.size;
    if (many <= 0) continue;

    const named = [...one.expects.cells];
    const rest = skipped.size === 0 ? '' : `, and ${doing} the rest`;
    apart.push({
      id: `${EXCEPT}${by}`,
      what: `${excepting(by, many)}${rest}`,
      moves: named.length,
      sample: named.slice(0, 3),
    });
  }

  return apart;
}

/** The groups an answer can be made for; the rest of `Stood` has nothing that would write the cell. */
const EXCEPTED: readonly Stood[] = ['range', 'definition', 'parameter', 'file'];

/** The answer that writes one group as an exception, by the group it names. */
const EXCEPT = 'except:';

/** Which group an answer names, or `null` where it is not one of those answers. */
export function excepted(choice: string): Stood | null {
  const by = choice.startsWith(EXCEPT) ? choice.slice(EXCEPT.length) : '';
  return EXCEPTED.find((one) => one === by) ?? null;
}

/** The answer that leaves what could not be done, named the same on both sides. */
export const ONLY = 'only';
const EMPTIED = 'Empty the ones that can be';
export const PASTED = 'Paste into the ones that can take it';

/** That answer, taken. Worked out again rather than remembered: the file may have moved. */
export async function emptied(
  spec: Spec,
  ranged: Ranged,
  choice: string,
  port: Port,
): Promise<void> {
  if (choice !== ONLY) {
    port.refuse('that answer is no longer one of the ways this edit could be made', null);
    return;
  }

  await empty(spec, ranged, port, true);
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
  const sheet = sheetNamed(typed.sheet, port);
  if (sheet === null) return;

  // *Apply it anyway* is the same gesture again, with the surprises accepted.
  const again = ANYWAY.exec(choice);
  if (again !== null) {
    const id = again[1] ?? '';
    return id === '' ? write(spec, typed, port, true) : resolve(spec, typed, id, port, true);
  }

  const at = addrAt({ col: typed.col, row: typed.row });
  const answers = candidates(resolving(spec, reading(port.text)), { sheet, at }, typed.text);
  const taken = answers.find((one) => one.id === choice);

  if (taken === undefined) {
    port.refuse('that answer is no longer one of the ways this edit could be made', null);
    return;
  }

  const done = await applied(spec, taken.intent, port, {
    anyway,
    from: taken.id,
    about: about(typed),
  });
  if (done) port.said(`${taken.what.replace(/^C/, 'c')}: ${taken.moves.length} cells changed.`);
}

/** The message an edit came in as, which is what the reader sends back to confirm it (ADR-048). */
function about(typed: Typed): About {
  return { ...typed, kind: 'edit' };
}

/** Nothing to send back: a gesture the reader cannot be asked again about. */
const ASKED: Asked = { anyway: false, from: null, about: null };

/** *Apply it anyway*, for the gesture itself or for one of its answers. */
export const ANYWAY = /^anyway:?(.*)$/;

/** What an override says a cell holds, where the reader did not type a formula. */
function value(meant: Meaning): string | number | boolean | null {
  return meant.is === 'value' ? meant.value : null;
}

/** The spec as the resolver needs it: what it draws, the files it is written in, and its settings. */
function resolving(spec: Spec, read: Reading): Resolving {
  return { grid: spec.grid, read, params: spec.params };
}

/** A candidate as the view shows one: what it does, and what it would move. */
export function shown(candidate: Candidate): Choice {
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
  const sheet = sheetNamed(typed.sheet, port);
  if (sheet === null) return;

  const at = addrAt({ col: typed.col, row: typed.row });
  const meant = meaning(typed.text);
  const said = meant.is === 'formula' ? { formula: meant.body } : { value: value(meant) };
  const says: Says = { ...said, ...(reason === undefined ? {} : { reason }) };

  const done = await applied(spec, override(spec, { sheet, at }, says, reading(port.text)), port, {
    anyway: false,
    from: null,
    about: about(typed),
  });
  if (done) port.said(`${sheet}!${at} is now written as an override.`);
}

/** The sheet a gesture named, or `null` once the reader has been told it is not a name. */
export function sheetNamed(said: string, port: Port): SheetName | null {
  const read = sheetName(said);
  if (read === null) port.refuse(`\`${said}\` is not a name a sheet can have`, null);

  return read;
}

/** What is needed to ask this edit again where the checker finds it moves more than it named. */
export interface Asked {
  readonly anyway: boolean;
  readonly from: string | null;
  readonly about: About | null;
}

/** The half of a write that is the same whichever intent produced it. */
export async function applied(
  spec: Spec,
  intent: Intent,
  port: Port,
  asked: Asked,
): Promise<boolean> {
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
    port.refuse(
      surprising(done.surprises),
      asked.about === null
        ? null
        : {
            about: asked.about,
            canOverride: false,
            choices: [anyhow(done.surprises, asked.from)],
          },
    );
    return false;
  }

  await port.put(intent.file, done.text);
  port.kept(
    intent.kind === 'edit' && done.back !== null
      ? { file: intent.file, patch: intent.patch, back: done.back, moved: moved(done.changed) }
      : null,
  );
  return true;
}

/** The cells an edit moved, named as an undo of it may name them (ADR-009). */
export function moved(changed: readonly Change[]): string[] {
  return changed.filter((one) => one.kind === 'cell').map((one) => qualified(one.sheet, one.at));
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
