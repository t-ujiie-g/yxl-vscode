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
  couldBlock,
  type Intent,
  type Meaning,
  meaning,
  override,
  type Pasting,
  pasteRange,
  pasteText,
  type Reading,
  type Resolving,
  reading,
  type Says,
  type Shape,
  setFormula,
  setValue,
  tabular,
} from '@yxl-vscode/intent';
import type { IncludeReader } from '@yxl-vscode/loader';
import { type History, redid, type Step, took } from '@yxl-vscode/patch';
import type { SpecDoc } from '@yxl-vscode/spec';
import {
  type A1Addr,
  addrAt,
  type FilePath,
  filePath,
  qualified,
  type SheetName,
  sheetName,
} from '@yxl-vscode/units';
import { type Change, checked, checkedText } from '@yxl-vscode/verify';
import type { Choice, Pasted, PastedText, Ranged, Typed } from '@yxl-vscode/webview/protocol';

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
  readonly typed: Typed | null;
  readonly ranged: Ranged | null;
  readonly pasted: Pasted | null;
  readonly text: PastedText | null;
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
      await applied(spec, sole.intent, port, { anyway, from: sole.id, typed });
      return;
    }

    // Rebuilt rather than spread: the incoming message carries its own `kind`.
    const offer = { sheet: typed.sheet, row: typed.row, col: typed.col, text: typed.text };
    port.refuse(intent.why, {
      typed: offer,
      ranged: null,
      pasted: null,
      text: null,
      canOverride: excepts(spec, where),
      choices: answers.map(shown),
    });
    return;
  }

  await applied(spec, intent, port, { anyway, from: null, typed });
}

/**
 * Every cell of a rectangle emptied, as one edit. One that cannot be emptied
 * refuses the whole and is offered as an answer instead: the same rectangle
 * with `only` those that can (ADR-001).
 */
export async function empty(spec: Spec, ranged: Ranged, port: Port, only = false): Promise<void> {
  const sheet = sheetName(ranged.sheet);
  if (sheet === null) {
    port.refuse(`\`${ranged.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const read = reading(port.text);
  const { top, left, bottom, right } = ranged;
  const where = { sheet, rect: { top, left, bottom, right } };
  const intent = clearRange(spec.grid, where, read, only);

  if (intent.kind === 'refused' && !only) {
    const some = clearRange(spec.grid, where, read, true);
    port.refuse(intent.why, some.kind === 'edit' ? theseOnly(ranged, some.expects.cells) : null);
    return;
  }

  const done = await applied(spec, intent, port, { anyway: false, from: null, typed: null });
  if (done && intent.kind === 'edit') {
    const cells = intent.expects.cells.size;
    port.said(`${cells} cell${cells === 1 ? '' : 's'} emptied.`);
  }
}

/**
 * A rectangle put down somewhere else, as one edit. A cell that cannot take it
 * refuses the whole and is offered as an answer instead: the same paste with
 * `only` the cells that can (ADR-001, ADR-032).
 */
export async function paste(spec: Spec, pasted: Pasted, port: Port, only = false): Promise<void> {
  const where = pasting(pasted);
  if (where === null) {
    port.refuse(`\`${pasted.from.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const read = reading(port.text);
  const intent = pasteRange(spec.grid, where, read, only);

  if (intent.kind === 'refused' && !only) {
    const some = pasteRange(spec.grid, where, read, true);
    port.refuse(intent.why, some.kind === 'edit' ? theseCells(pasted, some.expects.cells) : null);
    return;
  }

  const done = await applied(spec, intent, port, { anyway: false, from: null, typed: null });
  if (done && intent.kind === 'edit') {
    const cells = intent.expects.cells.size;
    port.said(`${cells} cell${cells === 1 ? '' : 's'} ${pasted.cut ? 'moved' : 'pasted'}.`);
  }
}

/** That answer, taken. Worked out again rather than remembered: the file may have moved. */
export async function pastedWith(
  spec: Spec,
  pasted: Pasted,
  choice: string,
  port: Port,
): Promise<void> {
  if (choice !== ONLY) {
    port.refuse('that answer is no longer one of the ways this edit could be made', null);
    return;
  }

  await paste(spec, pasted, port, true);
}

/** What the view named, in the units the resolver works in. */
function pasting(pasted: Pasted): Pasting | null {
  const from = sheetName(pasted.from.sheet);
  const to = sheetName(pasted.sheet);
  if (from === null || to === null) return null;

  const { top, left, bottom, right } = pasted.from;

  return {
    from: { sheet: from, rect: { top, left, bottom, right } },
    to: { sheet: to, at: addrAt({ col: pasted.col, row: pasted.row }) },
    cut: pasted.cut,
  };
}

/**
 * A rectangle from another spreadsheet put down in the grid. The shape it lands
 * in is the reader's to pick, with the lines each answer would add said before
 * it is made (ADR-028, §8 Q11).
 */
export async function pasteFrom(
  spec: Spec,
  asked: PastedText,
  port: Port,
  choice?: string,
): Promise<void> {
  const sheet = sheetName(asked.sheet);
  if (sheet === null) {
    port.refuse(`\`${asked.sheet}\` is not a name a sheet can have`, null);
    return;
  }

  const where = { sheet, at: addrAt({ col: asked.col, row: asked.row }) };
  const rows = tabular(asked.text);
  if (rows.length === 0) {
    port.refuse('there is nothing on the clipboard to put down', null);
    return;
  }

  if (choice === ONLY) {
    await land(spec, where, rows, 'cells', true, asked, port);
    return;
  }

  const shapes = ways(spec, where, rows);
  const taken =
    choice === undefined ? (shapes.length === 1 ? shapes[0] : undefined) : shaped(shapes, choice);

  if (taken === undefined) {
    if (choice !== undefined) {
      port.refuse('that answer is no longer one of the ways this edit could be made', null);
      return;
    }

    port.refuse(counted(rows), {
      typed: null,
      ranged: null,
      pasted: null,
      text: asked,
      canOverride: false,
      choices: shapes,
    });
    return;
  }

  await land(spec, where, rows, taken.id === 'data' ? 'data' : 'cells', false, asked, port);
}

/** The rectangle written in the shape that was picked, with the answer a refusal has. */
async function land(
  spec: Spec,
  where: { sheet: SheetName; at: A1Addr },
  rows: readonly (readonly string[])[],
  shape: Shape,
  only: boolean,
  asked: PastedText,
  port: Port,
): Promise<void> {
  const read = reading(port.text);
  const intent = pasteText(spec.grid, where, rows, read, shape, only);

  if (intent.kind === 'refused' && shape === 'cells' && !only) {
    const some = pasteText(spec.grid, where, rows, read, 'cells', true);
    port.refuse(intent.why, some.kind === 'edit' ? theseFields(asked, some.expects.cells) : null);
    return;
  }

  const done = await applied(spec, intent, port, { anyway: false, from: null, typed: null });
  if (done && intent.kind === 'edit') {
    const cells = intent.expects.cells.size;
    port.said(`${cells} cell${cells === 1 ? '' : 's'} pasted.`);
  }
}

function shaped(shapes: readonly Choice[], choice: string): Choice | undefined {
  return shapes.find((one) => one.id === choice);
}

/** How many cells the clipboard holds, asked before the shape is picked. */
function counted(rows: readonly (readonly string[])[]): string {
  const cells = rows.reduce((sum, row) => sum + row.length, 0);
  return `${cells} cells from the clipboard: how should they be written?`;
}

/** The shapes a rectangle from outside could land in, with the lines each would add. */
function ways(
  spec: Spec,
  where: { sheet: SheetName; at: A1Addr },
  rows: readonly (readonly string[])[],
): Choice[] {
  const cells = rows.reduce((sum, row) => sum + row.length, 0);
  const entries: Choice = {
    id: 'cells',
    what: `As \`cells:\` entries — ${cells} line${cells === 1 ? '' : 's'}`,
    moves: cells,
    sample: [],
  };
  if (!couldBlock(spec.grid, where, rows)) return [entries];

  return [
    {
      id: 'data',
      what: `As one \`data:\` block — ${rows.length + 2} lines`,
      moves: cells,
      sample: [],
    },
    entries,
  ];
}

/** The one answer a refused paste from outside has: leave the cells that cannot take it. */
function theseFields(asked: PastedText, cells: ReadonlySet<string>): Offer {
  const named = [...cells];

  return {
    typed: null,
    ranged: null,
    pasted: null,
    text: asked,
    canOverride: false,
    choices: [
      {
        id: ONLY,
        what: 'Paste into the ones that can take it',
        moves: named.length,
        sample: named.slice(0, 3),
      },
    ],
  };
}

/** The one answer a refused paste has: leave the cells that cannot take it where they are. */
function theseCells(pasted: Pasted, cells: ReadonlySet<string>): Offer {
  const named = [...cells];

  return {
    typed: null,
    ranged: null,
    pasted,
    text: null,
    canOverride: false,
    choices: [
      {
        id: ONLY,
        what: 'Paste into the ones that can take it',
        moves: named.length,
        sample: named.slice(0, 3),
      },
    ],
  };
}

/** The one answer a refused rectangle has: leave what cannot be emptied where it is. */
function theseOnly(ranged: Ranged, cells: ReadonlySet<string>): Offer {
  const named = [...cells];

  return {
    typed: null,
    ranged,
    pasted: null,
    text: null,
    canOverride: false,
    choices: [
      {
        id: ONLY,
        what: 'Empty the ones that can be',
        moves: named.length,
        sample: named.slice(0, 3),
      },
    ],
  };
}

/** The answer that leaves what cannot be emptied, named the same on both sides. */
const ONLY = 'only';

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
  const answers = candidates(resolving(spec, reading(port.text)), { sheet, at }, typed.text);
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

/** The spec as the resolver needs it: what it draws, the files it is written in, and its settings. */
function resolving(spec: Spec, read: Reading): Resolving {
  return { grid: spec.grid, read, params: spec.params };
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
    override(spec.doc, spec.grid, { sheet, at }, says, reading(port.text)),
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
        : {
            typed,
            ranged: null,
            pasted: null,
            text: null,
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
function moved(changed: readonly Change[]): string[] {
  return changed.filter((one) => one.kind === 'cell').map((one) => qualified(one.sheet, one.at));
}

/** Where the grid's undo landed, and the history it left behind. */
export interface Taken {
  readonly at: 'here' | 'shell' | 'nowhere';
  readonly history: History;
}

/**
 * The last edit taken back, or put on again, in the file itself — while this
 * editor is still the last thing to have touched it. Where it is not, the
 * editor's own undo is the only honest one and this says so (ADR-030).
 */
export async function goBack(
  spec: Spec,
  history: History,
  redoing: boolean,
  port: Port,
): Promise<Taken> {
  const step = (redoing ? history.undone : history.done).at(-1);
  if (step === undefined) {
    return { at: owns(history, redoing, port) ? 'nowhere' : 'shell', history };
  }

  const file = filePath(step.file);
  if (file === null) return { at: 'shell', history };

  const source = port.text(file);
  if (source === null || source !== port.left(file)) return { at: 'shell', history };

  const done = checked(
    source,
    redoing ? step.patch : step.back,
    { cells: new Set(step.moved), beyond: 'refuse' },
    { root: spec.root, file, read: spec.read, params: spec.params },
  );
  if (done.ok === false || done.back === null) return { at: 'shell', history };

  await port.put(file, done.text);
  return {
    at: 'here',
    history: redoing
      ? redid(history, { ...step, back: done.back, moved: moved(done.changed) })
      : took(history),
  };
}

/** Whether this editor still holds the file its history ends at, with nothing on this side left to take. */
function owns(history: History, redoing: boolean, port: Port): boolean {
  const step = (redoing ? history.done : history.undone).at(-1);
  const file = step === undefined ? null : filePath(step.file);
  if (file === null) return false;

  const now = port.text(file);
  return now !== null && now === port.left(file);
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
