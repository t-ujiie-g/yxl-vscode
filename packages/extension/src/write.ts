import { type CompiledGrid, cellAt, type DataReader, type Setting } from '@yxl-vscode/compile';
import { type Intent, override, type Says, setFormula, setValue } from '@yxl-vscode/intent';
import type { IncludeReader } from '@yxl-vscode/loader';
import type { SpecDoc } from '@yxl-vscode/spec';
import { type A1Addr, addrAt, type FilePath, type SheetName, sheetName } from '@yxl-vscode/units';
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
  readonly refuse: (why: string, override: Typed | null) => void;
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
  if (sheet === null) return;

  const at = addrAt({ col: typed.col, row: typed.row });
  const where = { sheet, at };

  // A leading `=` is a formula, as it is in Excel and in every spreadsheet a
  // reader has used; the spec's own two keys are the same distinction.
  const intent = typed.text.startsWith('=')
    ? setFormula(spec.grid, where, typed.text.slice(1), port.text)
    : setValue(spec.grid, where, meant(typed.text), port.text);

  if (intent.kind === 'refused') {
    port.refuse(intent.why, exception(spec, where, typed));
    return;
  }

  await applied(spec, intent, port);
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
  if (sheet === null) return;

  const where = { sheet, at: addrAt({ col: typed.col, row: typed.row }) };
  const says: Says = typed.text.startsWith('=')
    ? { formula: typed.text.slice(1), ...(reason === undefined ? {} : { reason }) }
    : { value: meant(typed.text), ...(reason === undefined ? {} : { reason }) };

  await applied(spec, override(spec.doc, spec.grid, where, says, port.text), port);
}

/** The half of a write that is the same whichever intent produced it. */
async function applied(spec: Spec, intent: Intent, port: Port): Promise<void> {
  if (intent.kind === 'refused') {
    port.refuse(intent.why, null);
    return;
  }

  const source = port.text(intent.file);
  if (source === null) {
    port.refuse(`${intent.file} could not be read`, null);
    return;
  }

  const done = checked(source, intent.patch, intent.expects, {
    root: spec.root,
    file: intent.file,
    read: spec.read,
    params: spec.params,
  });

  if (done.ok === false) {
    port.refuse(done.diagnostics[0]?.message ?? surprising(done.surprises), null);
    return;
  }
  if (done.ok === 'ask') {
    port.refuse(surprising(done.surprises), null);
    return;
  }

  await port.put(intent.file, done.text);
}

/**
 * The gesture, offered back as an override — where there is a cell to name.
 *
 * An address nothing is written at has nothing to except; the offer would be
 * the editor inventing a cell for a reader who mistyped.
 */
function exception(
  spec: Spec,
  where: { sheet: SheetName; at: A1Addr },
  typed: Typed,
): Typed | null {
  const sheet = spec.grid.sheets.find((one) => one.name === where.sheet);
  if (sheet === undefined || cellAt(sheet, where.at) === null) return null;

  return typed;
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
